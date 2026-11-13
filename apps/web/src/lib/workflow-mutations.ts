import { session, conversation, must, uuid, codedError, WorkflowError } from "./workflow-server";
import { reportReasons, bodyFields, studioStyles } from "./workflows";
import { styles } from "./types";
type Body = Record<string, unknown>;
const text = (b: Body, k: string) =>
  typeof b[k] === "string" ? (b[k] as string).trim() : "";
export function dates(body: Body, required = true) {
  const start = text(body, "start"),
    end = text(body, "end");
  if (!required && !start && !end) return { start: null, end: null };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    end < start
  )
    throw new WorkflowError("Choose an end date on or after your start date.");
  return { start, end };
}
export async function chatMutation(id: string, action: string, body: Body) {
  const { user, client, c } = await conversation(id);
  const peer = c.renter_id === user.id ? c.lender_id : c.renter_id;
  if (action === "read") {
    must(
      await client.rpc("mark_conversation_read", { p_conversation_id: id }),
      "Could not mark this chat as read.",
    );
    return { ok: true };
  }
  if (action === "dates") {
    if (c.renter_id !== user.id)
      throw new WorkflowError(
        "Only the renter can change requested dates.",
        403,
      );
    const { start, end } = dates(body);
    must(
      await client.rpc("set_conversation_dates", {
        p_conversation_id: id,
        p_start: start,
        p_end: end,
      }),
      "Could not change your dates.",
    );
    return { ok: true };
  }
  if (action === "send") {
    const message = text(body, "message");
    if (!message || message.length > 2000)
      throw new WorkflowError("Write a message up to 2,000 characters.");
    const data = must(
      await client
        .from("messages")
        .insert({ conversation_id: id, sender_id: user.id, body: message })
        .select("*")
        .single(),
      "You can't message this user.",
    );
    return data;
  }
  if (action === "block") {
    if (body.blocked === false)
      must(
        await client
          .from("blocks")
          .delete()
          .eq("blocker_id", user.id)
          .eq("blocked_id", peer),
        "Could not unblock this user.",
      );
    else
      must(
        await client
          .from("blocks")
          .upsert(
            { blocker_id: user.id, blocked_id: peer },
            { onConflict: "blocker_id,blocked_id" },
          ),
        "Could not block this user.",
      );
    return { ok: true };
  }
  if (action === "report") {
    const reason = text(body, "reason"),
      details = text(body, "details"),
      messageId = text(body, "messageId");
    if (!reportReasons.includes(reason) || details.length > 500)
      throw new WorkflowError(
        "Choose a reason and keep details under 500 characters.",
      );
    if (messageId) {
      const message = must(
        await client
          .from("messages")
          .select("sender_id")
          .eq("id", messageId)
          .eq("conversation_id", id)
          .maybeSingle(),
      );
      if (!message || message.sender_id === user.id)
        throw new WorkflowError("Choose an incoming message to report.");
    }
    must(
      await client.from("reports").insert({
        reporter_id: user.id,
        target_type: messageId ? "message" : "user",
        target_id: messageId || peer,
        reason,
        details: details || null,
      }),
      "Could not send your report.",
    );
    return { ok: true };
  }
  // C3: every rental step is a database function; the database checks who and from which state.
  if (action === "rental_request") {
    const { start, end } = dates(body);
    return {
      id: must(
        await client.rpc("request_rental", {
          p_listing_id: c.listing_id,
          p_start: start,
          p_end: end,
        }),
      ),
    };
  }
  const rentalId = text(body, "rentalId");
  if (action.startsWith("rental_") && !uuid(rentalId))
    throw new WorkflowError("Rental not found.", 404);
  const note = text(body, "note") || null;
  if (note && note.length > 300)
    throw new WorkflowError("Keep the note under 300 characters.", 400, "note");
  if (action === "rental_respond") {
    const answer = text(body, "answer");
    if (answer !== "accept" && answer !== "decline")
      throw new WorkflowError("Answer accept or decline.");
    return { status: must(await client.rpc("respond_rental", { p_rental_id: rentalId, p_answer: answer, p_note: note })) };
  }
  if (action === "rental_cancel")
    return { status: must(await client.rpc("cancel_rental", { p_rental_id: rentalId, p_reason: note })) };
  if (action === "rental_pickup")
    return { status: must(await client.rpc("mark_picked_up", { p_rental_id: rentalId, p_note: note })) };
  if (action === "rental_return")
    return { status: must(await client.rpc("mark_returned", { p_rental_id: rentalId, p_note: note })) };
  if (action === "rental_complete")
    return { status: must(await client.rpc("complete_rental", { p_rental_id: rentalId })) };
  if (action === "rental_report") {
    const reason = text(body, "reason"),
      details = text(body, "details");
    if (!reportReasons.includes(reason) || details.length > 500)
      throw new WorkflowError("Choose a reason and keep details under 500 characters.");
    must(
      await client.from("reports").insert({
        reporter_id: user.id,
        target_type: "rental",
        target_id: rentalId,
        reason,
        details: details || null,
      }),
    );
    return { ok: true };
  }
  throw new WorkflowError("Action not found.", 404);
}

/**
 * C3: one condition photo (multipart: photo, rentalId, stage), already compressed to JPEG in the
 * browser, saved as {rental_id}/{stage}/{random}.jpg in the private bucket rental-photos. Storage
 * refuses it outside the matching state (row-level security): DZ-E4021.
 */
export async function uploadRentalPhoto(request: Request, conversationId: string) {
  const { client } = await conversation(conversationId);
  const f = await request.formData();
  const file = f.get("photo");
  const rentalId = String(f.get("rentalId") || "");
  const stage = String(f.get("stage") || "");
  if (!uuid(rentalId) || (stage !== "pickup" && stage !== "return"))
    throw new WorkflowError("Rental not found.", 404);
  if (!(file instanceof File) || file.type !== "image/jpeg" || file.size > 10485760 || file.size < 4)
    throw new WorkflowError("Choose a JPEG, PNG or WebP photo.", 400, undefined, "DZ-E2064");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new WorkflowError("Could not read this photo. Choose another.");
  const random = crypto.randomUUID().replace(/-/g, "");
  const path = rentalId + "/" + stage + "/" + random + ".jpg";
  const uploaded = await client.storage
    .from("rental-photos")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) {
    const said = (uploaded.error.message || "").toLowerCase();
    if (said.includes("row-level security") || said.includes("unauthorized"))
      throw codedError({ message: "DZ-E4021: Photos for this step can't be added now." }, 403);
    throw codedError({ message: "DZ-E9999: upload failed" });
  }
  return { path };
}
export async function accountMutation(action: string, body: Body) {
  const { user, client } = await session();
  if (action === "role") {
    const role = text(body, "role");
    if (!["renter", "lender", "both"].includes(role))
      throw new WorkflowError("Choose Rent, Lend or Both.");
    if (role === "renter") {
      const listings = must(
        await client
          .from("listings")
          .select("id")
          .eq("lender_id", user.id)
          .eq("status", "active"),
      );
      if (listings?.length && body.confirm !== true)
        throw new WorkflowError(
          "Switch to Rent only? Your listings will be paused.",
          409,
        );
      must(
        await client
          .from("listings")
          .update({ status: "paused" })
          .eq("lender_id", user.id)
          .eq("status", "active"),
        "Could not pause your listings.",
      );
    }
    must(
      await client.from("profiles").update({ role }).eq("id", user.id),
      "Could not switch your role.",
    );
    return { ok: true };
  }
  if (action === "studio") {
    const name = text(body, "studio_name"),
      handle = text(body, "studio_handle"),
      bio = text(body, "studio_bio"),
      pickup = text(body, "pickup_area");
    const tags = body.style_tags as string[];
    if (
      name.length > 40 ||
      bio.length > 200 ||
      pickup.length > 60 ||
      (handle && !/^[a-z0-9._]{3,30}$/.test(handle)) ||
      !Array.isArray(tags) ||
      tags.length > 5 ||
      tags.some((t) => !studioStyles.includes(t))
    )
      throw new WorkflowError("Check your studio fields.");
    must(
      await client
        .from("profiles")
        .update({
          studio_name: name || null,
          studio_handle: handle || null,
          studio_bio: bio || null,
          pickup_area: pickup || null,
          style_tags: tags,
        })
        .eq("id", user.id),
      "Couldn't save your studio. Please try again.",
    );
    return { ok: true };
  }
  if (action === "measurements") {
    const interests = body.style_interests as string[];
    if (
      !Array.isArray(interests) ||
      interests.some((s) => !styles.includes(s)) ||
      ![null, "man", "woman"].includes(body.fit_profile as string | null)
    )
      throw new WorkflowError("Check your measurements.");
    const measurements: Record<string, number | null> = {};
    for (const key of bodyFields) {
      const n = body[key];
      if (
        n !== null &&
        (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n >= 300)
      )
        throw new WorkflowError(
          "That doesn't look right. Check the number and unit.",
        );
      measurements[key] = n as number | null;
    }
    must(
      await client.from("private_profiles").upsert(
        {
          user_id: user.id,
          ...measurements,
          fit_profile: body.fit_profile,
          style_interests: interests,
        },
        { onConflict: "user_id" },
      ),
      "Couldn't save your measurements. Please try again.",
    );
    return { ok: true };
  }
  if (action === "give_measurements_consent") {
    must(
      await client.rpc("give_measurements_consent"),
      "Couldn't record measurements consent.",
    );
    return { ok: true };
  }
  if (action === "withdraw_measurements_consent") {
    must(
      await client.rpc("withdraw_measurements_consent"),
      "Couldn't withdraw measurements consent.",
    );
    return { ok: true };
  }
  if (action === "notifications") {
    const flags = ["messages", "show_message_text", "rental_reminders"] as const;
    if (flags.some((k) => typeof body[k] !== "boolean"))
      throw new WorkflowError("Choose on or off.");
    must(
      await client.from("notification_settings").upsert(
        {
          user_id: user.id,
          messages: body.messages as boolean,
          show_message_text: body.show_message_text as boolean,
          rental_reminders: body.rental_reminders as boolean,
        },
        { onConflict: "user_id" },
      ),
    );
    return { ok: true };
  }
  if (action === "unblock") {
    must(
      await client
        .from("blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", text(body, "id")),
      "Could not unblock this user.",
    );
    return { ok: true };
  }
  if (action === "password") {
    const current = text(body, "current"),
      password = text(body, "password");
    if (current.length < 8 || password.length < 8)
      throw new WorkflowError("Use at least 8 characters.");
    if (current === password)
      throw new WorkflowError("Choose a different new password.");
    const verified = await client.auth.signInWithPassword({
      email: user.email || "",
      password: current,
    });
    if (verified.error)
      throw new WorkflowError("Current password is incorrect.");
    const updated = await client.auth.updateUser({ password });
    if (updated.error)
      throw new WorkflowError(
        "Couldn't change your password. Please try again.",
      );
    return { ok: true };
  }
  throw new WorkflowError("Action not found.", 404);
}
