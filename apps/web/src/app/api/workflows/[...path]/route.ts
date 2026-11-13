import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/request-origin";
import {
  session,
  readInbox,
  readChat,
  readCloset,
  readSettings,
  readRentals,
  editorData,
  ownListing,
  must,
  codedError,
  WorkflowError,
  uuid,
} from "@/lib/workflow-server";
import { chatMutation, accountMutation, dates, uploadRentalPhoto } from "@/lib/workflow-mutations";
import {
  saveListing,
  finishListing,
  scanListing,
  uploadPhoto,
  removePhoto,
  edgeDelete,
} from "@/lib/listing-mutations";
import { declarationTexts } from "@/lib/workflows";
type Params = { params: Promise<{ path: string[] }> };
const reply = (data: unknown) =>
  NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof WorkflowError ? error.message : "Something went wrong. Please try again. (DZ-E9999)",
      field: error instanceof WorkflowError ? error.field : undefined,
      code: error instanceof WorkflowError ? error.code : "DZ-E9999",
    },
    {
      status: error instanceof WorkflowError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
/**
 * Settings > Privacy > Download my data (P3A): the export-my-data Edge Function, as the signed-in
 * user, returned as a file. Once a day; the function's own sentence explains a refusal.
 */
async function exportMyData() {
  const { client } = await session();
  const result = await client.functions.invoke("export-my-data", { body: {} });
  if (result.error) {
    // C1: { code, message }; DZ-E7001 (once a day) carries the time in its message.
    const context = (result.error as { context?: Response }).context;
    let body: unknown = { code: "DZ-E7002" };
    if (context) {
      try {
        body = await context.json();
      } catch {}
    }
    throw codedError(body, context?.status === 429 ? 429 : 400);
  }
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(result.data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dzirent-data-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await session();
    const { path } = await params;
    switch (path[0]) {
      case "inbox":
        return reply(await readInbox());
      case "chat":
        return reply(await readChat(path[1]));
      case "closet":
        return reply(await readCloset());
      case "settings":
        return reply(await readSettings());
      case "rentals":
        return reply(await readRentals());
      case "editor":
        return reply(await editorData(path[1]));
      case "listing":
        return reply(await ownListing(path[1]));
      default:
        throw new WorkflowError("Page not found.", 404);
    }
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    if (!sameOrigin(request))
      throw new WorkflowError("Request not allowed.", 403);
    const { user, client } = await session();
    const { path } = await params;
    if (path[0] === "photo" && path[2] === "upload")
      return reply(await uploadPhoto(request, path[1]));
    // C3: a condition photo for a rental in this chat (multipart, like listing photos).
    if (path[0] === "chat" && path[2] === "rental-photo")
      return reply(await uploadRentalPhoto(request, path[1]));
    let body: Record<string, unknown>;
    try {
      body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error();
    } catch {
      throw new WorkflowError("Invalid request.");
    }
    if (path[0] === "chat")
      return reply(await chatMutation(path[1], path[2], body));
    if (path[0] === "export") return await exportMyData();
    if (path[0] === "account") {
      if (path[1] === "delete") {
        if (String(body.confirm).trim() !== "DELETE")
          throw new WorkflowError("Type DELETE to confirm.");
        return reply(await edgeDelete("delete-account"));
      }
      return reply(await accountMutation(path[1], body));
    }
    if (path[0] === "start") {
      const id = String(body.listingId || "");
      if (!uuid(id)) throw new WorkflowError("Listing not found.");
      const { start, end } = dates(body);
      return reply({
        id: must(
          await client.rpc("start_conversation", {
            p_listing_id: id,
            p_start: start,
            p_end: end,
          }),
          "Could not start this conversation. The listing may no longer be available.",
        ),
      });
    }
    if (path[0] === "seen") {
      must(
        await client.rpc("mark_activity_seen"),
        "Could not mark Activity as seen.",
      );
      return reply({ ok: true });
    }
    if (path[0] === "declaration") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length > 120) throw new WorkflowError("Up to 120 characters.");
      if ((name.match(/\p{L}/gu) || []).length < 2)
        throw new WorkflowError("Type your full legal name.");
      if (
        !Array.isArray(body.ticks) ||
        body.ticks.length !== declarationTexts.length ||
        body.ticks.some((t) => t !== true)
      )
        throw new WorkflowError("Please confirm every statement.");
      must(
        await client.rpc("record_accessory_declaration", {
          p_full_legal_name: name,
          p_declaration_version: 1,
          p_app_version: "web-1.0.0",
        }),
        "Could not sign the declaration. Please try again.",
      );
      return reply({ ok: true });
    }
    if (path[0] === "listings") {
      if (path[1] === "save") return reply(await saveListing(body));
      if (path[1] === "finish") return reply(await finishListing(body));
      if (path[1] === "scan") return reply(await scanListing(body));
      const listing = await ownListing(path[1]);
      if (path[2] === "delete")
        return reply(
          await edgeDelete("delete-listing", { listing_id: listing.id }),
        );
      if (path[2] === "status") {
        if (body.status !== "active" && body.status !== "paused")
          throw new WorkflowError("Choose Active or Paused.");
        if (body.status === "active" && !listing.photos.length)
          throw new WorkflowError(
            'Add at least one photo (Edit) before turning "' +
              listing.title +
              '" on.',
          );
        must(
          await client
            .from("listings")
            .update({ status: body.status })
            .eq("id", listing.id)
            .eq("lender_id", user.id),
          "Could not change listing status.",
        );
        return reply({ ok: true });
      }
    }
    if (path[0] === "photo" && path[2] === "delete")
      return reply(await removePhoto(path[1], String(body.id || "")));
    throw new WorkflowError("Action not found.", 404);
  } catch (error) {
    return failure(error);
  }
}
