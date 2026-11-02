import {
  session,
  must,
  ownListing,
  WorkflowError,
  uuid,
} from "./workflow-server";
import { validateListing, type ListingForm } from "./listing-form";
import { slots } from "./workflows";
type Body = Record<string, unknown>;
function form(body: Body): ListingForm {
  const f = body.form as ListingForm;
  if (
    !f ||
    typeof f.title !== "string" ||
    typeof f.category !== "string" ||
    !Array.isArray(f.measurements) ||
    !Array.isArray(f.availability) ||
    !Array.isArray(f.listing_styles)
  )
    throw new WorkflowError("Check your listing details.");
  const error = validateListing(f);
  if (error) throw new WorkflowError(error);
  return f;
}
async function signedAccessory(f: ListingForm) {
  if (f.category !== "Accessories") return;
  const { user, client } = await session();
  const rows = must(
    await client
      .from("accessory_declarations")
      .select("id")
      .eq("user_id", user.id)
      .eq("declaration_version", 1)
      .limit(1),
  );
  if (!rows?.length)
    throw new WorkflowError(
      "Sign the accessory declaration to list jewelry or accessories.",
    );
}
export async function saveListing(body: Body) {
  const { user, client } = await session();
  const f = form(body);
  await signedAccessory(f);
  const profile = must(
    await client
      .from("profiles")
      .select("role,city,approx_lat,approx_lng")
      .eq("id", user.id)
      .single(),
  );
  if (!profile) throw new WorkflowError("Could not load your profile.");
  if (!["lender", "both"].includes(profile.role))
    throw new WorkflowError(
      "Switch to Lend or Both in your profile before listing a piece.",
    );
  const id = String(body.id || "");
  if (!uuid(id)) throw new WorkflowError("Check your listing.");
  const existing = must(
    await client
      .from("listings")
      .select("id")
      .eq("id", id)
      .eq("lender_id", user.id)
      .maybeSingle(),
  );
  if (!existing && (profile.approx_lat == null || profile.approx_lng == null))
    throw new WorkflowError("Set your location before publishing.");
  const details = {
    title: f.title.trim(),
    category: f.category,
    description: f.description.trim() || null,
    item_type: f.category === "Accessories" ? f.item_type : null,
    garment_type: f.garment_type,
    size_label: f.size_label.trim(),
    price_usd: Number(f.price_usd),
    price_note: f.price_note.trim() || null,
    retail_value: f.retail_value ? Number(f.retail_value) : null,
    deposit_note: f.deposit_note.trim() || null,
    listing_styles: f.listing_styles,
    status: "paused",
  };
  if (existing)
    must(
      await client
        .from("listings")
        .update(details)
        .eq("id", id)
        .eq("lender_id", user.id),
      "Could not save listing details.",
    );
  else
    must(
      await client.from("listings").insert({
        ...details,
        id,
        lender_id: user.id,
        city: profile.city,
        approx_lat: profile.approx_lat,
        approx_lng: profile.approx_lng,
      }),
      "Could not save listing details.",
    );
  return { id };
}
export async function finishListing(body: Body) {
  const { user, client } = await session();
  const id = String(body.id || "");
  const listing = await ownListing(id);
  const f = form(body);
  await signedAccessory(f);
  if (!listing.photos.length)
    throw new WorkflowError("Add at least one photo before publishing.");
  const order = body.photos as { id: string; slot: string }[];
  if (
    !Array.isArray(order) ||
    order.length !== listing.photos.length ||
    order.length > 6 ||
    new Set(order.map((p) => p.id)).size !== order.length ||
    new Set(order.map((p) => p.slot)).size !== order.length ||
    order.some(
      (p) =>
        !slots.includes(p.slot) ||
        !listing.photos.some((old) => old.id === p.id),
    )
  )
    throw new WorkflowError("Check your photo slots.");
  for (let i = 0; i < order.length; i++)
    must(
      await client
        .from("listing_photos")
        .update({ position: i, slot: order[i].slot })
        .eq("id", order[i].id)
        .eq("listing_id", id),
      "Could not save photo order.",
    );
  must(
    await client.from("listing_measurements").delete().eq("listing_id", id),
    "Could not save measurements.",
  );
  if (f.measurements.length)
    must(
      await client.from("listing_measurements").insert(
        f.measurements.map((m) => ({
          listing_id: id,
          label: m.label.trim(),
          value: m.value,
          unit: m.unit,
        })),
      ),
      "Could not save measurements.",
    );
  must(
    await client.from("availability").delete().eq("listing_id", id),
    "Could not save availability.",
  );
  must(
    await client.from("availability").insert(
      f.availability.map((a) => ({
        listing_id: id,
        start_date: a.start_date,
        end_date: a.end_date,
      })),
    ),
    "Could not save availability.",
  );
  if (f.category === "Accessories")
    must(
      await client.rpc("record_listing_declaration", {
        p_listing_id: id,
        p_declaration_version: 1,
      }),
      "Could not record this item’s declaration.",
    );
  must(
    await client
      .from("listings")
      .update({ status: body.status === "paused" ? "paused" : "active" })
      .eq("id", id)
      .eq("lender_id", user.id),
    "Could not publish this listing.",
  );
  return { id };
}
export async function uploadPhoto(request: Request, id: string) {
  const { client } = await session();
  const listing = await ownListing(id);
  const f = await request.formData();
  const file = f.get("photo");
  const slot = String(f.get("slot") || "front");
  const token = String(f.get("token") || "");
  if (
    !(file instanceof File) ||
    file.type !== "image/jpeg" ||
    file.size > 2500000 ||
    file.size < 4 ||
    !slots.includes(slot) ||
    !uuid(token)
  )
    throw new WorkflowError("Choose a JPEG photo under 2.5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new WorkflowError("Could not read this photo. Choose another.");
  const path = id + "/" + token + ".jpg";
  const prior = listing.photos.find((p) => p.storage_path === path);
  if (prior) return prior;
  if (listing.photos.length >= 6)
    throw new WorkflowError("You can add up to 6 photos.");
  must(
    await client.storage
      .from("listing-photos")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true }),
    "Could not upload this photo.",
  );
  const result = await client
    .from("listing_photos")
    .insert({
      listing_id: id,
      storage_path: path,
      slot,
      position: listing.photos.length,
    })
    .select("id,storage_path,position,slot")
    .single();
  if (result.error) {
    await client.storage.from("listing-photos").remove([path]);
    throw new WorkflowError("Could not save this photo.");
  }
  return result.data;
}
export async function removePhoto(id: string, photoId: string) {
  const listing = await ownListing(id);
  const { client } = await session();
  const p = listing.photos.find((p) => p.id === photoId);
  if (!p) return { ok: true };
  must(
    await client.storage.from("listing-photos").remove([p.storage_path]),
    "Could not remove this photo.",
  );
  must(
    await client
      .from("listing_photos")
      .delete()
      .eq("id", p.id)
      .eq("listing_id", id),
    "Could not remove this photo.",
  );
  return { ok: true };
}
export async function edgeDelete(
  name: "delete-listing" | "delete-account",
  body?: object,
) {
  const { client } = await session();
  const result = await client.functions.invoke(name, { body: body || {} });
  if (result.error) {
    const context = (result.error as { context?: Response }).context;
    let active = false;
    if (context) {
      try {
        active = (await context.json()).error === "active_rental";
      } catch {}
    }
    throw new WorkflowError(
      active
        ? "You have active rentals. Mark them as returned or say the deal didn’t happen in the chat before deleting your account."
        : "Could not delete. Please try again.",
      active ? 409 : 400,
    );
  }
  if (name === "delete-account") await client.auth.signOut({ scope: "local" });
  return { ok: true };
}
