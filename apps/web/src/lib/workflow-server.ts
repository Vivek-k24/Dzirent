import "server-only";
import { currentUser, serverClient } from "./supabase/server";
import { suspensionNotice } from "./suspension";
import { describeError, errorText } from "./errors";
import type {
  ChatData,
  Conversation,
  ConversationCard,
  InboxData,
  Message,
  Outcome,
  OwnListing,
  OwnPhoto,
  PrivateProfile,
  Profile,
  Rental,
  RentalView,
  SettingsData,
} from "./workflows";
import { IN_PROGRESS, type Range, type RentalSettings } from "./rentals";
import type { PayoutAccount } from "./workflows";
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
    public field?: string,
    /** C1: the catalog code (contracts/error-codes.json) when the error has one. */
    public code?: string,
  ) {
    super(message);
  }
}
/** C1: a database refusal as the page shows it: the catalog's words for its code, then the code. */
export function codedError(error: unknown, status = 400): WorkflowError {
  const shown = describeError(error);
  return new WorkflowError(errorText(shown), status, shown.field, shown.code);
}
/**
 * The data, or a WorkflowError for the database's refusal (C1): the catalog's words for its code;
 * an error without a code shows DZ-E9999. [context] says what the call was for, for readers.
 */
export function must<T>(
  result: { data: T; error: unknown },
  context?: string,
): T {
  void context;
  if (result.error) throw codedError(result.error);
  return result.data;
}
export async function session() {
  const [user, client] = await Promise.all([currentUser(), serverClient()]);
  if (!user) throw new WorkflowError("Sign in to continue.", 401);
  return { user, client };
}
export const uuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
export async function conversation(id: string) {
  if (!uuid(id)) throw new WorkflowError("Conversation not found.", 404);
  const { user, client } = await session();
  const c = must(
    await client
      .from("conversations")
      .select("*")
      .eq("id", id)
      .or("renter_id.eq." + user.id + ",lender_id.eq." + user.id)
      .maybeSingle(),
    "Could not load this conversation.",
  ) as Conversation | null;
  if (!c) throw new WorkflowError("Conversation not found.", 404);
  return { user, client, c };
}
async function conversationCards() {
  const { client } = await session();
  const cards: ConversationCard[] = [];
  for (let offset = 0; offset < 3000; offset += 30) {
    const rows = must(
      await client.rpc("my_conversations", { p_limit: 30, p_offset: offset }),
      "Failed to load your inbox.",
    ) as ConversationCard[];
    cards.push(...rows);
    if (rows.length < 30) break;
  }
  return cards;
}
export async function readInbox(): Promise<InboxData> {
  const { user, client } = await session();
  const [cards, convs, rentals, outcomes, priv, latest] = await Promise.all([
    conversationCards(),
    client
      .from("conversations")
      .select("*")
      .or("renter_id.eq." + user.id + ",lender_id.eq." + user.id)
      .order("created_at", { ascending: false }),
    client
      .from("rentals")
      .select("*")
      .or("renter_id.eq." + user.id + ",lender_id.eq." + user.id),
    client
      .from("rental_outcomes")
      .select("conversation_id,user_id,happened")
      .eq("user_id", user.id),
    client
      .from("private_profiles")
      .select("activity_seen_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("messages")
      .select("conversation_id,sender_id,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  return {
    now: Date.now(),
    me: user.id,
    cards: cards.map((c) => ({
      ...c,
      last_sender_id: (must(latest) || []).find(
        (m) => m.conversation_id === c.id,
      )?.sender_id,
    })),
    conversations: must(convs, "Failed to load your inbox.") as Conversation[],
    rentals: must(rentals) as Rental[],
    outcomes: must(outcomes) as Outcome[],
    activitySeen: must(priv)?.activity_seen_at || null,
  };
}
/** C3: signed links (1 hour) to a rental's condition photos; the bucket is private. */
async function photoLinks(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { client } = await session();
  const { data } = await client.storage.from("rental-photos").createSignedUrls(paths, 3600);
  const links: Record<string, string> = {};
  for (const link of data || []) if (link.path && link.signedUrl) links[link.path] = link.signedUrl;
  return links;
}
/** C3: every rental I'm in (my_rentals), incoming requests to me first. */
export async function readRentals(): Promise<RentalView[]> {
  const { client } = await session();
  return (must(await client.rpc("my_rentals", { p_limit: 100 })) || []) as RentalView[];
}
export async function readChat(id: string): Promise<ChatData> {
  const { user, client, c } = await conversation(id);
  const peer = c.renter_id === user.id ? c.lender_id : c.renter_id;
  const [cards, messages, rental, listing, block, myProf, settings] = await Promise.all([
    client.rpc("my_conversations", {
      p_conversation_id: id,
      p_limit: 1,
      p_offset: 0,
    }),
    client
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(1000),
    client.rpc("get_rental", { p_conversation_id: id }),
    // The renter's "Request to rent" needs the piece's open and booked days.
    c.renter_id === user.id
      ? client.rpc("get_listing", { p_listing_id: c.listing_id })
      : Promise.resolve({ data: [], error: null }),
    client
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", peer)
      .maybeSingle(),
    client
      .from("profiles")
      .select("suspended_until,suspension_reason")
      .eq("id", user.id)
      .maybeSingle(),
    // C5: the request answer time and whether payments are on (readable by everyone).
    client.rpc("rental_settings"),
  ]);
  const view = (must(rental) as RentalView | null) || null;
  const piece = ((must(listing) as Array<{ price: number | null; availability: Range[]; booked: Range[] }>) || [])[0];
  const toRange = (r: { start_date: string; end_date: string }) => ({ start: r.start_date, end: r.end_date });
  return {
    now: Date.now(),
    me: user.id,
    conversation: c,
    card: (must(cards) as ConversationCard[])[0] || null,
    messages: (must(messages) || []).reverse() as Message[],
    rental: view,
    photoLinks: await photoLinks((view?.photos || []).map((p) => p.storage_path)),
    rentable: piece
      ? {
          price: piece.price,
          availability: (piece.availability as unknown as { start_date: string; end_date: string }[]).map(toRange),
          booked: ((piece.booked || []) as unknown as { start_date: string; end_date: string }[]).map(toRange),
        }
      : null,
    blocked: Boolean(must(block)),
    mySuspension: suspensionNotice(
      myProf.data?.suspended_until,
      myProf.data?.suspension_reason,
    ),
    settings: settings.error ? null : ((settings.data as RentalSettings | null) ?? null),
  };
}
/** C5: the rental and payment rules (rental_settings()), or null when unreadable. */
export async function readRentalSettings(): Promise<RentalSettings | null> {
  const { client } = await session();
  const { data, error } = await client.rpc("rental_settings");
  return error ? null : ((data as RentalSettings | null) ?? null);
}
export async function ownListing(id: string): Promise<OwnListing> {
  if (!uuid(id))
    throw new WorkflowError("You can only edit your own listings.", 404);
  const { user, client } = await session();
  const result = must(
    await client
      .from("listings")
      .select("*")
      .eq("id", id)
      .eq("lender_id", user.id)
      .maybeSingle(),
    "Could not load this listing.",
  );
  if (!result)
    throw new WorkflowError("You can only edit your own listings.", 404);
  const [photos, measurements, availability] = await Promise.all([
    client
      .from("listing_photos")
      .select("id,storage_path,position,slot")
      .eq("listing_id", id)
      .order("position"),
    client
      .from("listing_measurements")
      .select("label,value,unit")
      .eq("listing_id", id),
    client
      .from("availability")
      .select("start_date,end_date")
      .eq("listing_id", id)
      .order("start_date"),
  ]);
  return {
    ...result,
    photos: must(photos) as OwnPhoto[],
    measurements: must(measurements),
    availability: must(availability),
  } as OwnListing;
}
export async function readCloset() {
  const { user, client } = await session();
  const [profile, listings, inbox, photos] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).single(),
    client
      .from("listings")
      .select("*")
      .eq("lender_id", user.id)
      .order("created_at", { ascending: false }),
    readInbox(),
    client
      .from("listing_photos")
      .select("id,listing_id,storage_path,position,slot")
      .order("position"),
  ]);
  const rows = must(listings, "Failed to load your closet.") || [];
  const allPhotos = must(photos) || [];
  return {
    profile: must(profile) as Profile,
    listings: rows.map((l) => ({
      ...l,
      photos: allPhotos.filter((p) => p.listing_id === l.id),
    })) as OwnListing[],
    inbox,
  };
}
export async function readSettings(): Promise<SettingsData> {
  const { user, client } = await session();
  const [profile, priv, blocks, rentals, listings, notifications, settings, payout] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).single(),
    client
      .from("private_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    client.from("blocks").select("blocked_id").eq("blocker_id", user.id),
    client
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .in("status", IN_PROGRESS)
      .or("renter_id.eq." + user.id + ",lender_id.eq." + user.id),
    client
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("lender_id", user.id)
      .eq("status", "active"),
    client
      .from("notification_settings")
      .select("messages,show_message_text,rental_reminders,email_rentals")
      .eq("user_id", user.id)
      .maybeSingle(),
    client.rpc("rental_settings"),
    client
      .from("payout_accounts")
      .select("charges_enabled,payouts_enabled,details_submitted")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  must(rentals);
  must(listings);
  return {
    profile: must(profile) as Profile,
    privateProfile: must(priv) as PrivateProfile | null,
    email: user.email || "",
    blocks: must(blocks) || [],
    activeRentals: rentals.count || 0,
    activeListings: listings.count || 0,
    notifications: must(notifications) || { messages: true, show_message_text: false, rental_reminders: true, email_rentals: true },
    paymentsEnabled: !settings.error && (settings.data as RentalSettings | null)?.payments_enabled === true,
    payoutAccount: payout.error ? null : ((payout.data as PayoutAccount | null) ?? null),
  };
}
export async function editorData(id?: string) {
  const { user, client } = await session();
  const [settings, listing, declarations, others] = await Promise.all([
    readSettings(),
    id ? ownListing(id) : null,
    client
      .from("accessory_declarations")
      .select("id")
      .eq("user_id", user.id)
      .eq("declaration_version", 1)
      .limit(1),
    client
      .from("listings")
      .select("id,title,garment_type,listing_measurements(label,value,unit)")
      .eq("lender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  return {
    me: user.id,
    profile: settings.profile,
    listing,
    signed: Boolean(must(declarations)?.length),
    otherListings: (must(others) || []).filter((l) => l.id !== id),
    paymentsEnabled: settings.paymentsEnabled,
  };
}
