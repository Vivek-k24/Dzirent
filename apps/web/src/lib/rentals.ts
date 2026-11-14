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
  // C4/C5: the payment side (shown by the C5 screens).
  deposit_amount?: number | null;
  payment_status?: string;
  deposit_status?: string;
  refund_amount?: number | null;
  claim_window_ends_at?: string | null;
  fee_amount?: number | null;
  tax_amount?: number | null;
  deposit_captured_amount?: number | null;
  deposit_capture_before?: string | null;
  payment_due_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  lender_can_take_payment?: boolean;
  claim?: RentalClaim | null;
};
/** C4/C5: the lender's claim against the deposit (both people see it). */
export type RentalClaim = {
  id: string;
  status: "open" | "accepted" | "disputed" | "decided";
  amount: number;
  reason: string | null;
  evidence_paths: string[];
  renter_note: string | null;
  decision_amount: number | null;
  decision: string | null;
  created_at: string;
  decided_at: string | null;
};
/** C5: the rules the screens show (rental_settings(), readable by everyone). */
export type RentalSettings = {
  payments_enabled: boolean;
  rental_request_hours: number | null;
  payment_deadline_hours: number | null;
  claim_window_hours: number | null;
  cancellation_refund_cutoff_hours: number | null;
  late_cancellation_refund_percent: number | null;
  platform_fee_percent: number | null;
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
  | "complete"
  // C5: payments
  | "pay"
  | "place_hold"
  | "file_claim"
  | "accept_claim"
  | "dispute_claim"
  | "receipt";

export const actionLabels: Record<RentalAction, string> = {
  accept: "Accept",
  decline: "Decline",
  cancel: "Cancel rental",
  pickup_photos: "Add pickup photos",
  picked_up: "Mark picked up",
  return_photos: "Add return photos",
  returned: "Mark returned",
  complete: "Complete rental",
  pay: "Pay",
  place_hold: "Place deposit hold and mark picked up",
  file_claim: "File a claim",
  accept_claim: "Accept the claim",
  dispute_claim: "Dispute the claim",
  receipt: "Receipt",
};

/** C5: the payment side of a rental, as the actions need it (the apps' PaymentFacts). */
export type PaymentFacts = {
  paymentsOn: boolean;
  paymentStatus?: string;
  depositAmount?: number | null;
  depositStatus?: string;
  claimWindowOpen?: boolean;
  claimStatus?: string | null;
};
const WAS_PAID = ["paid", "partially_refunded", "refunded"];

/** The payment facts of [r] at [now] (ms). */
export function paymentFacts(r: RentalView, now = Date.now()): PaymentFacts {
  const window = r.claim_window_ends_at ? Date.parse(r.claim_window_ends_at) : NaN;
  return {
    paymentsOn: r.payments_enabled,
    paymentStatus: r.payment_status ?? "none",
    depositAmount: r.deposit_amount ?? null,
    depositStatus: r.deposit_status ?? "none",
    claimWindowOpen: r.status === "returned" && Number.isFinite(window) && window > now,
    claimStatus: r.claim?.status ?? null,
  };
}

/**
 * What this person can do now. Nobody cancels after pickup; pickup and return are the lender's.
 * C5, with payments ([pay]): the renter pays an accepted rental; a paid rental with a deposit is
 * picked up by placing the hold; during the claim window the lender may file a claim; the renter
 * accepts or disputes an open claim; a paid rental that ended has a receipt.
 */
export function rentalActions(status: string, iAmLender: boolean, pay: PaymentFacts = { paymentsOn: false }): RentalAction[] {
  const deposit = (pay.depositAmount ?? 0) > 0;
  const holdInPlace = pay.depositStatus === "held" || pay.depositStatus === "pending";
  switch (status) {
    case "requested":
      return iAmLender ? ["accept", "decline"] : ["cancel"];
    case "accepted":
      return iAmLender ? ["pickup_photos", "picked_up", "cancel"] : ["pickup_photos", "cancel"];
    case "paid":
      if (!iAmLender) return ["pickup_photos", "cancel"];
      return ["pickup_photos", pay.paymentsOn && deposit && pay.depositStatus !== "held" ? "place_hold" : "picked_up", "cancel"];
    case "awaiting_payment":
      return !iAmLender && pay.paymentsOn ? ["pay", "cancel"] : ["cancel"];
    case "picked_up":
      return iAmLender ? ["return_photos", "returned"] : ["return_photos"];
    case "returned":
      if (!iAmLender) return ["return_photos"];
      return pay.claimWindowOpen && deposit && holdInPlace && !pay.claimStatus
        ? ["return_photos", "file_claim", "complete"]
        : ["return_photos", "complete"];
    case "claimed":
      return !iAmLender && pay.claimStatus === "open" ? ["accept_claim", "dispute_claim"] : [];
    case "completed":
    case "cancelled":
      return WAS_PAID.includes(pay.paymentStatus ?? "none") ? ["receipt"] : [];
    default:
      return [];
  }
}

/** "$220" or "$220.50", with thousands separators, as the website's prices. */
export function money(amount: number): string {
  const cents = Math.round(amount * 100);
  const digits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(cents / 100);
}
/** "$220.00": receipts. */
export function moneyCents(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.round(amount * 100) / 100);
}
/** "Pay $220". */
export function payLabel(total: number | null | undefined): string {
  return total == null ? "Pay" : "Pay " + money(total);
}

/** The deposit in plain words, or null without one. */
export function depositLine(amount: number | null | undefined, status: string | undefined, captured: number | null | undefined): string | null {
  if (amount == null || amount <= 0) return null;
  const m = money(amount);
  switch (status) {
    case "held":
      return `Deposit ${m}: held on the renter's card, not charged`;
    case "pending":
      return `Deposit ${m}: the hold is being placed`;
    case "released":
      return `Deposit ${m}: released, nothing charged`;
    case "captured":
      return `Deposit ${m}: ${money(captured ?? amount)} charged for the claim`;
    case "failed":
      return `Deposit ${m}: the hold didn't go through`;
    default:
      return `Deposit ${m}: held on the renter's card at pickup`;
  }
}

/** A claim's state in plain words, from the viewer's side. */
export function claimLine(status: string | null | undefined, amount: number | null | undefined, decided: number | null | undefined, iAmLender: boolean): string | null {
  if (!status || amount == null) return null;
  const m = money(amount);
  switch (status) {
    case "open":
      return iAmLender ? `Claim for ${m}: waiting for the renter` : `Claim for ${m}: accept or dispute it`;
    case "accepted":
      return `Claim for ${m}: accepted by the renter`;
    case "disputed":
      return `Claim for ${m}: disputed. Dzirent will decide.`;
    case "decided":
      return (decided ?? 0) > 0 ? `Claim decided: ${money(decided!)} from the deposit` : "Claim decided: no charge, the hold is released";
    default:
      return null;
  }
}

const AMOUNT = /^\d+(\.\d{1,2})?$/;
/** Why a claim of [text] dollars can't be filed against [deposit] (file_claim's DZ-E4041), or null. */
export function claimAmountProblem(text: string, deposit: number | null | undefined): string | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!AMOUNT.test(t)) return "DZ-E4041";
  const n = Number(t);
  return n <= 0 || deposit == null || n > deposit + 1e-9 ? "DZ-E4041" : null;
}
/** The claim's reason: 3 to 500 characters (DZ-E4042). */
export function claimReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  return n < 3 || n > 500 ? "DZ-E4042" : null;
}
/** The evidence: 1 to 10 of the rental's return photos (DZ-E4043). */
export function claimPhotosProblem(chosen: number): string | null {
  return chosen < 1 || chosen > 10 ? "DZ-E4043" : null;
}
/** The listing editor's optional deposit in dollars: null for none, a number, or "DZ-E4051". */
export function parseDepositAmount(text: string): number | null | "DZ-E4051" {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return !AMOUNT.test(t) || !(n > 0) || n > 99999.99 ? "DZ-E4051" : n;
}

/** C5: a lender's payouts as My studio shows them. */
export type PayoutState = "not_set_up" | "finish_setup" | "ready";
export const payoutLabels: Record<PayoutState, { label: string; button: string }> = {
  not_set_up: { label: "Not set up", button: "Set up payouts" },
  finish_setup: { label: "Finish setup", button: "Finish setup" },
  ready: { label: "Payouts ready", button: "Update payout details" },
};
export function payoutState(account: { charges_enabled: boolean; payouts_enabled: boolean } | null): PayoutState {
  if (!account) return "not_set_up";
  return account.charges_enabled && account.payouts_enabled ? "ready" : "finish_setup";
}

export type ReceiptLine = { label: string; amount: string };
/**
 * C5: a receipt for a paid rental that ended (the apps' rentalReceipt). The renter: paid,
 * refunded, charged from the deposit. The lender: the fee and refunds in proportion, the deposit.
 */
export function rentalReceipt(r: Pick<RentalView, "your_role" | "price_per_day" | "days" | "total" | "tax_amount" | "fee_amount" | "refund_amount" | "deposit_amount" | "deposit_status" | "deposit_captured_amount">): ReceiptLine[] {
  const rental = r.total ?? 0;
  const tax = r.tax_amount ?? 0;
  const back = r.refund_amount ?? 0;
  const fee = r.fee_amount ?? 0;
  const captured = r.deposit_status === "captured" ? r.deposit_captured_amount ?? 0 : 0;
  const lines: ReceiptLine[] = [
    {
      label: r.price_per_day != null && r.days != null ? `${moneyCents(r.price_per_day)} × ${r.days === 1 ? "1 day" : r.days + " days"}` : "Rental",
      amount: moneyCents(rental),
    },
  ];
  if (r.your_role === "lender") {
    const feeShare = rental > 0 && fee > 0 ? (fee * (rental - back)) / rental : 0;
    if (fee > 0) lines.push({ label: "Dzirent fee", amount: "-" + moneyCents(feeShare) });
    if (back > 0) lines.push({ label: "Refunded to the renter", amount: "-" + moneyCents(back) });
    if (captured > 0) lines.push({ label: "From the deposit", amount: moneyCents(captured) });
    lines.push({ label: "You receive", amount: moneyCents(rental - back - feeShare + captured) });
  } else {
    if (tax > 0) lines.push({ label: "Sales tax", amount: moneyCents(tax) });
    lines.push({ label: "Paid", amount: moneyCents(rental + tax) });
    if (back > 0) lines.push({ label: "Refunded", amount: "-" + moneyCents(back) });
    if (captured > 0) lines.push({ label: "Charged from the deposit", amount: moneyCents(captured) });
    lines.push({ label: "Total", amount: moneyCents(rental + tax - back + captured) });
  }
  if ((r.deposit_amount ?? 0) > 0 && r.deposit_status === "released") {
    lines.push({ label: "Deposit hold " + moneyCents(r.deposit_amount!), amount: "released" });
  }
  return lines;
}

/** The photo stage open for uploads (the bucket's rule), or null. */
export function conditionPhotoStage(status: string): "pickup" | "return" | null {
  if (status === "accepted" || status === "paid") return "pickup";
  if (status === "picked_up" || status === "returned") return "return";
  return null;
}

/** "48 hours", "1 hour". */
export function hoursText(hours: number): string {
  return hours === 1 ? "1 hour" : hours + " hours";
}

/**
 * The state in plain words. [requestHours] is the server's rental_request_hours
 * (rental_settings()); without it the request lines leave the number out.
 */
export function rentalStatusLabel(status: string, iAmLender: boolean, requestHours?: number | null): string {
  switch (status) {
    case "requested":
      if (!iAmLender) return "Requested: waiting for the lender";
      return requestHours ? "Rental request: answer within " + hoursText(requestHours) : "Rental request: answer it before it expires";
    case "accepted":
      return "Accepted: arrange the pickup";
    case "declined":
      return "Declined";
    case "expired":
      return requestHours ? "Expired: no answer in " + hoursText(requestHours) : "Expired: no answer in time";
    case "awaiting_payment":
      return iAmLender ? "Accepted: waiting for the renter's payment" : "Accepted: pay to confirm";
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
      return iAmLender ? "Claim filed: waiting for the renter" : "Claim filed: accept or dispute it";
    case "disputed":
      return "In dispute: Dzirent will decide";
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
 * (DZ-E4006), inside the availability (DZ-E4008; a listing with no windows is open every day from
 * today, C4 owner decision, as request_rental), and not over booked days (DZ-E4009). Back-to-back
 * is fine.
 */
export function rentalDatesProblem(wanted: Range, windows: Range[], booked: Range[], today: string): string | null {
  if (wanted.end < wanted.start) return "DZ-E4007";
  if (wanted.start < today) return "DZ-E4006";
  if (windows.length && !inside(windows, wanted)) return "DZ-E4008";
  if (booked.some((b) => !(b.end < wanted.start || wanted.end < b.start))) return "DZ-E4009";
  return null;
}
