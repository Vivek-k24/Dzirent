"use server";

import { revalidatePath } from "next/cache";
import { serverClient, currentUser } from "./supabase/server";
import { config } from "./supabase/config";

async function requireAdminSession() {
  const user = await currentUser();
  if (!user) {
    throw new Error("You must be signed in.");
  }
  const client = await serverClient();
  const { data: isAdmin } = await client.rpc("is_admin");
  if (!isAdmin) {
    throw new Error("Admins only, signed in with two-step verification.");
  }
  return { user, client };
}

async function callAdminEdgeFunction(payload: Record<string, unknown>) {
  const { client } = await requireAdminSession();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Admin session not found.");
  }

  const { url, key } = config();
  const response = await fetch(
    `${url.replace(/\/$/, "")}/functions/v1/admin-actions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    },
  );

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    const errorMsg =
      (body?.message as string) ||
      (body?.error as string) ||
      "Edge Function request failed.";
    throw new Error(errorMsg);
  }
  return body;
}

export async function dismissReportAction(reportId: string, reason: string) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_dismiss_report", {
    p_report_id: reportId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}

export async function warnUserAction(
  userId: string,
  note: string,
  reportId?: string | null,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_warn_user", {
    p_user_id: userId,
    p_note: note,
    p_report_id: reportId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/users");
}

export async function removeReportedContentAction(
  reportId: string,
  reason: string,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_remove_reported_content", {
    p_report_id: reportId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}

export async function suspendUserAction(
  userId: string,
  days: number,
  reason: string,
  reportId?: string | null,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_suspend_user", {
    p_user_id: userId,
    p_days: days,
    p_reason: reason,
    p_report_id: reportId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/users");
}

export async function unsuspendUserAction(userId: string, reason: string) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_unsuspend_user", {
    p_user_id: userId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/users");
}

export async function banUserAction(
  userId: string,
  reason: string,
  reportId?: string | null,
) {
  await callAdminEdgeFunction({
    action: "ban",
    user_id: userId,
    reason,
    report_id: reportId || null,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/users");
}

export async function unbanUserAction(
  userId: string,
  reason: string,
  reportId?: string | null,
) {
  await callAdminEdgeFunction({
    action: "unban",
    user_id: userId,
    reason,
    report_id: reportId || null,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/users");
}

export async function decideScanAction(
  scanId: string,
  decision: "approved" | "rejected",
  reason: string,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_decide_scan", {
    p_scan_id: scanId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/photo-reviews");
}

export async function hideListingAction(listingId: string, reason: string) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_hide_listing", {
    p_listing_id: listingId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/listings");
}

export async function unhideListingAction(listingId: string, reason: string) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_unhide_listing", {
    p_listing_id: listingId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/listings");
}

export async function createTakedownAction(data: {
  claimantName: string;
  claimantContact: string;
  work: string;
  urls?: string[];
  listingIds?: string[];
  receivedAt?: string | null;
  note?: string | null;
}) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_create_takedown", {
    p_claimant_name: data.claimantName,
    p_claimant_contact: data.claimantContact,
    p_work: data.work,
    p_urls: data.urls || [],
    p_listing_ids: data.listingIds || [],
    p_received_at: data.receivedAt || null,
    p_note: data.note || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/takedowns");
}

export async function takedownRemoveListingAction(
  takedownId: string,
  listingId: string,
  reason: string,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_takedown_remove_listing", {
    p_takedown_id: takedownId,
    p_listing_id: listingId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/takedowns");
}

export async function removePhotosAction(
  listingId: string,
  photoIds: string[],
  reason: string,
  takedownId?: string | null,
) {
  await callAdminEdgeFunction({
    action: "remove_photos",
    listing_id: listingId,
    photo_ids: photoIds,
    reason,
    takedown_id: takedownId || null,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/takedowns");
}

export async function recordCounterNoticeAction(
  takedownId: string,
  notice: string,
  receivedAt?: string | null,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_record_counter_notice", {
    p_takedown_id: takedownId,
    p_notice: notice,
    p_received_at: receivedAt || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/takedowns");
}

export async function setTakedownStatusAction(
  takedownId: string,
  status: string,
  note: string,
) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("admin_set_takedown_status", {
    p_takedown_id: takedownId,
    p_status: status,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/takedowns");
}

export async function setFlagAction(key: string, enabled: boolean) {
  const { client } = await requireAdminSession();
  const { error } = await client.rpc("set_flag", {
    p_key: key,
    p_enabled: enabled,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/flags");
  // The header on every page reads preview_label.
  if (key === "preview_label") revalidatePath("/", "layout");
}

export async function findUserAction(query: string) {
  const { client } = await requireAdminSession();
  const { data, error } = await client.rpc("admin_find_user", {
    p_query: query,
  });
  if (error) throw new Error(error.message);
  return (data || []) as Record<string, unknown>[];

}

