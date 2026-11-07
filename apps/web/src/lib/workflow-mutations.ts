import { session, conversation, must, WorkflowError } from "./workflow-server";
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
async function recordOutcome(conversationId: string, happened: boolean) {
  const { user, client } = await session();
  const existing = must(
    await client
      .from("rental_outcomes")
      .select("happened")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle(),
  );
  if (!existing) {
    const result = await client
      .from("rental_outcomes")
      .insert({ conversation_id: conversationId, user_id: user.id, happened });
    if (result.error && result.error.code !== "23505")
      throw new WorkflowError("Could not save your answer.");
  }
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
  if (action === "rental") {
    const status = text(body, "status");
    if (status === "no") {
      await recordOutcome(id, false);
      return { ok: true };
    }
    if (!["active", "returned", "cancelled"].includes(status))
      throw new WorkflowError("Choose a rental status.");
    let row = must(
      await client
        .from("rentals")
        .select("id")
        .eq("conversation_id", id)
        .maybeSingle(),
    );
    if (status === "returned" && !row)
      throw new WorkflowError("Mark this rental as rented first.");
    const range = dates(body, status === "active");
    const changes = {
      status,
      updated_by: user.id,
      ...(range.start ? { start_date: range.start, end_date: range.end } : {}),
    };
    if (!row) {
      const inserted = await client
        .from("rentals")
        .insert({
          ...changes,
          conversation_id: id,
          listing_id: c.listing_id,
          renter_id: c.renter_id,
          lender_id: c.lender_id,
        })
        .select("id")
        .single();
      if (inserted.error?.code === "23505")
        row = must(
          await client
            .from("rentals")
            .select("id")
            .eq("conversation_id", id)
            .single(),
        );
      else row = must(inserted, "Could not update this rental.");
    }
    if (row)
      must(
        await client
          .from("rentals")
          .update(changes)
          .eq("id", row.id)
          .eq("conversation_id", id),
        "Could not update this rental.",
      );
    if (status === "active" || status === "cancelled")
      await recordOutcome(id, status === "active");
    return { ok: true };
  }
  throw new WorkflowError("Action not found.", 404);
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
