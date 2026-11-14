import type { Range, RentalSettings, RentalStatus, RentalView } from "./rentals";
export type { RentalView } from "./rentals";
export type Profile = {
  id: string;
  display_name: string;
  role: "renter" | "lender" | "both";
  city: string | null;
  approx_lat: number | null;
  approx_lng: number | null;
  studio_name: string | null;
  studio_handle: string | null;
  studio_bio: string | null;
  pickup_area: string | null;
  style_tags: string[];
  suspended_until?: string | null;
  suspension_reason?: string | null;
};
export type PrivateProfile = {
  user_id: string;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  shoulder_cm: number | null;
  height_cm: number | null;
  inseam_cm: number | null;
  fit_profile: "man" | "woman" | null;
  style_interests: string[];
  activity_seen_at: string | null;
  measurements_consent_at: string | null;
};
export type OwnPhoto = {
  id: string;
  storage_path: string;
  position: number;
  slot: string;
};
export type Measurement = { label: string; value: number; unit: "cm" | "in" };
export type OwnListing = {
  id: string;
  lender_id: string;
  title: string;
  description: string | null;
  category: string;
  item_type: string | null;
  garment_type: string;
  size_label: string;
  price_usd: number;
  price_note: string | null;
  retail_value: number | null;
  deposit_note: string | null;
  /** C4/C5: the deposit held at pickup while payments are on (null = none). */
  deposit_amount?: number | null;
  listing_styles: string[];
  status: "active" | "paused";
  auto_paused_reason?: string | null;
  city: string;
  created_at: string;
  photos: OwnPhoto[];
  measurements: Measurement[];
  availability: { start_date: string; end_date: string }[];
};
export type Conversation = {
  id: string;
  listing_id: string;
  renter_id: string;
  lender_id: string;
  created_at: string;
  requested_start: string | null;
  requested_end: string | null;
};
export type ConversationCard = {
  id: string;
  listing_id: string;
  listing_title: string;
  cover_photo_path: string | null;
  price: number | null;
  other_name: string;
  other_handle: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id?: string;
  unread: boolean;
  requested_start: string | null;
  requested_end: string | null;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
/** A raw rentals row (participants read their own; C3 states, written only by the rental functions). */
export type Rental = {
  id: string;
  conversation_id: string;
  listing_id: string;
  renter_id: string;
  lender_id: string;
  status: RentalStatus;
  start_date: string | null;
  end_date: string | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
};
export type Outcome = {
  conversation_id: string;
  user_id: string;
  happened: boolean;
};
export type InboxData = {
  now: number;
  me: string;
  cards: ConversationCard[];
  conversations: Conversation[];
  rentals: Rental[];
  outcomes: Outcome[];
  activitySeen: string | null;
};
export type ChatData = {
  now: number;
  me: string;
  conversation: Conversation;
  card: ConversationCard | null;
  messages: Message[];
  /** C3: the chat's latest rental with its timeline and condition photos (get_rental). */
  rental: RentalView | null;
  /** Signed links (1 hour) to the condition photos, by storage path. */
  photoLinks: Record<string, string>;
  /** For "Request to rent": the piece's price per day, open windows and booked days (get_listing). */
  rentable: { price: number | null; availability: Range[]; booked: Range[] } | null;
  blocked: boolean;
  mySuspension?: string | null;
  /** C5: the rules the card shows (request answer time, payments on or off); null if unreadable. */
  settings: RentalSettings | null;
};
/** notification_settings; no row means these defaults (C3 adds rental_reminders, C5 email_rentals). */
export type NotificationChoicesData = {
  messages: boolean;
  show_message_text: boolean;
  rental_reminders: boolean;
  email_rentals: boolean;
};
/** C5: the lender's payout account (payout_accounts, owner read). */
export type PayoutAccount = { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };
export type SettingsData = {
  profile: Profile;
  privateProfile: PrivateProfile | null;
  email: string;
  blocks: { blocked_id: string }[];
  activeRentals: number;
  activeListings: number;
  notifications: NotificationChoicesData;
  /** C5: payments on (the payouts block and the deposit field show only then) and my payout account. */
  paymentsEnabled: boolean;
  payoutAccount: PayoutAccount | null;
};
export const itemTypes = [
  "Sunglasses",
  "Handbag",
  "Tie",
  "Watch (non-smart)",
  "Belt buckle",
  "Costume jewelry",
];
export const studioStyles = [
  "Minimalist",
  "Classic",
  "Vintage",
  "Streetwear",
  "Boho",
  "Glam",
  "Traditional",
  "Workwear",
  "Designer",
  "Plus size",
  "Petite",
  "Maternity",
];
export const slots = [
  "front",
  "back",
  "close_up",
  "size_tag",
  "extra_1",
  "extra_2",
];
export const slotNames = [
  "Front",
  "Back",
  "Close-up",
  "Size tag",
  "Extra 1",
  "Extra 2",
];
export const garmentKinds = {
  top: "Top or coat",
  trousers: "Trousers",
  suit: "Suit or blazer",
  dress: "Dress",
  skirt: "Skirt",
  saree: "Saree or lehenga",
  one_size: "Accessory",
};
export const templates: Record<string, string[]> = {
  top: ["Chest (flat)", "Shoulder", "Sleeve", "Length"],
  trousers: ["Waist (flat)", "Inseam", "Rise", "Leg opening"],
  suit: [
    "Chest (flat)",
    "Shoulder",
    "Sleeve",
    "Jacket length",
    "Waist (flat)",
    "Inseam",
  ],
  dress: ["Bust (flat)", "Waist (flat)", "Hips (flat)", "Length"],
  skirt: ["Waist (flat)", "Hips (flat)", "Length"],
  saree: [
    "Blouse bust (flat)",
    "Blouse length",
    "Skirt waist (flat)",
    "Skirt length",
  ],
  Sunglasses: ["Lens width", "Bridge", "Temple length"],
  Handbag: ["Width", "Height", "Depth", "Strap drop"],
  Tie: ["Length", "Width"],
  "Watch (non-smart)": ["Case diameter", "Band length"],
  "Belt buckle": ["Width", "Height"],
  "Costume jewelry": ["Length", "Width"],
};
export const declarationTexts = [
  "This accessory or jewelry is not real silver, gold or platinum, has no pearls and no diamonds or precious gemstones.",
  "It is not made of precious or expensive metals or materials.",
  "It is worth less than $300.",
  "I understand a false declaration breaks the Dzirent Terms and that I am responsible for this item.",
];
export const listingNotice =
  "Dzirent only connects people. Agree on price, dates, condition and any deposit in chat before you meet.";
export const fullPolicy =
  "Dzirent connects people who want to rent clothes. We don't handle payments, hold deposits, verify items or guarantee rentals. Agree on price, dates, condition and any deposit in chat before you meet. Meet in a public place and never send money before you see the item. For valuable pieces, we recommend lenders ask for a refundable deposit.";
export const safetyTip =
  "Safety tip: meet in a public place and never send money before you see the item. We recommend washing anything worn against the skin before wearing.";
export const reportReasons = [
  "Inappropriate photo",
  "Prohibited item",
  "Scam or fraud",
  "Harassment",
  "Other",
];
export const bodyFields = [
  "chest_cm",
  "waist_cm",
  "hips_cm",
  "shoulder_cm",
  "height_cm",
  "inseam_cm",
] as const;
export const bodyLabels = [
  "Chest",
  "Waist",
  "Hips",
  "Shoulder",
  "Height",
  "Inseam",
];
export const isoToday = () => new Date().toLocaleDateString("en-CA");
export function dateRange(start: string | null, end: string | null) {
  if (!start || !end) return "Dates not set";
  const format = (s: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(s + "T12:00:00Z"));
  return start === end ? format(start) : format(start) + " - " + format(end);
}
/** C3: Inbox > Activity, the latest step of each chat's rental (the apps' Activity.kt). */
export function activity(data: InboxData) {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const latest = new Map<string, Rental>();
  for (const r of data.rentals) {
    const before = latest.get(r.conversation_id);
    if (!before || (r.updated_at || r.created_at) > (before.updated_at || before.created_at))
      latest.set(r.conversation_id, r);
  }
  const updates = [...latest.values()].map((r) => {
    const c = cards.get(r.conversation_id);
    const who =
      r.updated_by === data.me ? "You" : c?.other_name || "Dzirent member";
    const title = "“" + (c?.listing_title || "Listing no longer available") + "”";
    const forDates = r.start_date ? " for " + dateRange(r.start_date, r.end_date) : "";
    const text: Record<string, string> = {
      requested: who + " asked to rent " + title + forDates,
      accepted: who + " accepted the rental of " + title + forDates,
      awaiting_payment: who + " accepted the rental of " + title + forDates,
      paid: who + " accepted the rental of " + title + forDates,
      declined: who + " declined the request for " + title,
      expired: "The request for " + title + " expired without an answer",
      picked_up: who + " marked " + title + " as picked up",
      returned: who + " marked " + title + " as returned",
      completed: "The rental of " + title + " is complete",
      cancelled: who + " cancelled the rental of " + title,
    };
    return {
      id: r.id,
      conversationId: r.conversation_id,
      time: r.updated_at || r.created_at,
      text: text[r.status] ?? "The rental of " + title + " changed",
      isNew:
        r.updated_by !== data.me &&
        (!data.activitySeen ||
          (r.updated_at || r.created_at) > data.activitySeen),
    };
  });
  return updates.sort((a, b) => b.time.localeCompare(a.time));
}
export class WorkflowClientError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "WorkflowClientError";
  }
}
export async function workflow<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/workflows/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new WorkflowClientError(result.error || "Something went wrong. Please try again. (DZ-E9999)", result.field);
  return result as T;
}

export function dateChip(start: string | null, end: string | null) {
  if (!start || !end) return "Dates not set";
  if (start === end) return dateRange(start, end);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const first = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(start + "T12:00:00Z"));
    return first + " - " + Number(end.slice(8));
  }
  return dateRange(start, end);
}
