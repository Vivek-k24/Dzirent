import "server-only";
import { currentUser, serverClient } from "./supabase/server";
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
  SettingsData,
} from "./workflows";
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
    public field?: string,
  ) {
    super(message);
  }
}
export function must<T>(
  result: { data: T; error: unknown },
  fallbackMessage = "Please try again.",
): T {
  if (result.error) {
    const pgError = result.error as {
      message?: string;
      hint?: string;
      code?: string;
      details?: string;
    };
    const msg = pgError.message || fallbackMessage;
    throw new WorkflowError(msg, 400, pgError.hint);
  }
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
export async function readChat(id: string): Promise<ChatData> {
  const { user, client, c } = await conversation(id);
  const peer = c.renter_id === user.id ? c.lender_id : c.renter_id;
  const [cards, messages, rental, outcome, block] = await Promise.all([
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
    client.from("rentals").select("*").eq("conversation_id", id).maybeSingle(),
    client
      .from("rental_outcomes")
      .select("conversation_id,user_id,happened")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", peer)
      .maybeSingle(),
  ]);
  return {
    now: Date.now(),
    me: user.id,
    conversation: c,
    card: (must(cards) as ConversationCard[])[0] || null,
    messages: (must(messages) || []).reverse() as Message[],
    rental: must(rental) as Rental | null,
    outcome: must(outcome) as Outcome | null,
    blocked: Boolean(must(block)),
  };
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
  const [profile, priv, blocks, rentals, listings] = await Promise.all([
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
      .eq("status", "active")
      .or("renter_id.eq." + user.id + ",lender_id.eq." + user.id),
    client
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("lender_id", user.id)
      .eq("status", "active"),
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
  };
}
