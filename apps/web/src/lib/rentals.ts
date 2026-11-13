// C3 rental rules for the website: the same as the apps' mobile/shared/.../util/Rentals.kt.
// The database decides (request_rental, respond_rental, cancel_rental, mark_picked_up,
// mark_returned, complete_rental); these only decide what to offer and how to word it.

export type RentalStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "expired"
  | "awaiting_payment"
  | "paid"
  | "picked_up"
  | "returned"
  | "completed"
  | "cancelled"
  | "claimed"
  | "disputed";

export type RentalEvent = {
  from: string | null;
  to: string;
  by: "you" | "other" | "dzirent";
  by_role: string | null;
  note: string | null;
  at: string;
};
export type RentalPhoto = {
  storage_path: string;
  stage: "pickup" | "return";
  by: "you" | "other";
  by_role: string | null;
  uploaded_at: string;
};
/** A rental as get_rental and my_rentals return it (events and photos only from get_rental). */
export type RentalView = {
  id: string;
  conversation_id: string;
  listing_id: string;
  listing_title: string | null;
  cover_photo_path: string | null;
  your_role: "renter" | "lender";
  other_name: string | null;
  other_handle: string | null;
  status: RentalStatus;
  start_date: string | null;
  end_date: string | null;
  price_per_day: number | null;
  days: number | null;
  total: number | null;
  currency: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  payments_enabled: boolean;
  events?: RentalEvent[];
  photos?: RentalPhoto[];
};

/** A chat can't get a new request while one of these is open. */
export const OPEN: RentalStatus[] = [
  "requested", "accepted", "awaiting_payment", "paid", "picked_up", "returned", "claimed", "disputed",
];
/** These block deleting the account. */
export const IN_PROGRESS: RentalStatus[] = [
  "accepted", "awaiting_payment", "paid", "picked_up", "returned", "claimed", "disputed",
];
export const MIN_CONDITION_PHOTOS = 2;

export type RentalAction =
  | "accept"
  | "decline"
  | "cancel"
  | "pickup_photos"
  | "picked_up"
  | "return_photos"
  | "returned"
  | "complete";

export const actionLabels: Record<RentalAction, string> = {
  accept: "Accept",
  decline: "Decline",
  cancel: "Cancel rental",
  pickup_photos: "Add pickup photos",
  picked_up: "Mark picked up",
  return_photos: "Add return photos",
  returned: "Mark returned",
  complete: "Complete rental",
};

/** What this person can do now. Nobody cancels after pickup; pickup and return are the lender's. */
export function rentalActions(status: string, iAmLender: boolean): RentalAction[] {
  switch (status) {
    case "requested":
      return iAmLender ? ["accept", "decline"] : ["cancel"];
    case "accepted":
    case "paid":
      return iAmLender ? ["pickup_photos", "picked_up", "cancel"] : ["pickup_photos", "cancel"];
    case "awaiting_payment":
      return ["cancel"];
    case "picked_up":
      return iAmLender ? ["return_photos", "returned"] : ["return_photos"];
    case "returned":
      return iAmLender ? ["return_photos", "complete"] : ["return_photos"];
    default:
      return [];
  }
}

/** The photo stage open for uploads (the bucket's rule), or null. */
export function conditionPhotoStage(status: string): "pickup" | "return" | null {
  if (status === "accepted" || status === "paid") return "pickup";
  if (status === "picked_up" || status === "returned") return "return";
  return null;
}

export function rentalStatusLabel(status: string, iAmLender: boolean): string {
  switch (status) {
    case "requested":
      return iAmLender ? "Rental request: answer within 48 hours" : "Requested: waiting for the lender";
    case "accepted":
      return "Accepted: arrange the pickup";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired: no answer in 48 hours";
    case "awaiting_payment":
      return "Accepted: waiting for payment";
    case "paid":
      return "Paid: arrange the pickup";
    case "picked_up":
      return "Picked up: return by the last day";
    case "returned":
      return "Returned";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "claimed":
      return "Claim opened";
    case "disputed":
      return "In dispute";
    default:
      return status;
  }
}

const steps: Record<string, string> = {
  requested: "Requested",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  awaiting_payment: "Accepted",
  paid: "Paid",
  picked_up: "Picked up",
  returned: "Returned",
  completed: "Completed",
  cancelled: "Cancelled",
  claimed: "Claim opened",
  disputed: "Disputed",
};

/** "Accepted by you", "Requested by Jordan", "Expired (Dzirent)". */
export function rentalEventLabel(to: string, by: string, otherName: string): string {
  const step = steps[to] ?? to;
  if (by === "you") return step + " by you";
  if (by === "dzirent") return step + " (Dzirent)";
  return step + " by " + otherName;
}

export type RentalGroup = "requests_for_you" | "waiting" | "upcoming" | "in_progress" | "past";
/** My rentals sections in screen order; lenders see incoming requests first. */
export const groupTitles: [RentalGroup, string][] = [
  ["requests_for_you", "Requests for you"],
  ["waiting", "Waiting for an answer"],
  ["upcoming", "Upcoming"],
  ["in_progress", "In progress"],
  ["past", "Past"],
];
export function rentalGroup(status: string, iAmLender: boolean): RentalGroup {
  if (status === "requested") return iAmLender ? "requests_for_you" : "waiting";
  if (status === "accepted" || status === "awaiting_payment" || status === "paid") return "upcoming";
  if (status === "picked_up" || status === "returned" || status === "claimed" || status === "disputed") return "in_progress";
  return "past";
}

export type Range = { start: string; end: string };
const dayMs = 86400000;
const toDay = (iso: string) => Date.parse(iso + "T00:00:00Z") / dayMs;

/** Days counting both ends (Nov 5 - 8 is 4), as the database counts them. */
export function rentalDays(r: Range): number {
  return toDay(r.end) - toDay(r.start) + 1;
}

/** "5 days · $75", formatted like the website's other prices (lib/types.ts price). */
export function requestTotal(perDay: number, r: Range): string {
  const days = rentalDays(r);
  const total = (Math.round(perDay * 100) * days) / 100;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(total);
  return (days === 1 ? "1 day" : days + " days") + " · " + money;
}

/** True if [wanted] lies inside the windows, adjacent windows joined. */
function inside(windows: Range[], wanted: Range): boolean {
  const merged: { s: number; e: number }[] = [];
  for (const w of [...windows].sort((a, b) => a.start.localeCompare(b.start))) {
    const s = toDay(w.start), e = toDay(w.end);
    const last = merged[merged.length - 1];
    if (last && s <= last.e + 1) last.e = Math.max(last.e, e);
    else merged.push({ s, e });
  }
  const ws = toDay(wanted.start), we = toDay(wanted.end);
  return merged.some((m) => m.s <= ws && m.e >= we);
}

/**
 * The catalog code that refuses [wanted], or null when it can be requested: today or later
 * (DZ-E4006), inside the availability (DZ-E4008; no windows means it can't be rented), and not over
 * booked days (DZ-E4009). Back-to-back is fine.
 */
export function rentalDatesProblem(wanted: Range, windows: Range[], booked: Range[], today: string): string | null {
  if (wanted.end < wanted.start) return "DZ-E4007";
  if (wanted.start < today) return "DZ-E4006";
  if (!windows.length || !inside(windows, wanted)) return "DZ-E4008";
  if (booked.some((b) => !(b.end < wanted.start || wanted.end < b.start))) return "DZ-E4009";
  return null;
}
