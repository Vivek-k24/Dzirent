// C6: ID verification as the website words it. The database decides everything (my_verification,
// didit-start, the gate); these only turn its answers into labels, sentences and links. The apps
// have the same rules in mobile/shared/.../util/Verification.kt.
// The .ts extension lets `npm test` (Node, type stripping) load this file as it is.

export type VerificationStatus = "not_started" | "in_progress" | "in_review" | "verified" | "declined" | "expired";

/** my_verification(): the person's own check (never the legal name). */
export type MyVerification = {
  status: VerificationStatus;
  attempts: number;
  max_attempts: number;
  attempts_left: number;
  can_start: boolean;
  /** verification_required is on: chats, messages and publishing need a verified ID. */
  required: boolean;
  verified_at: string | null;
  updated_at: string | null;
};

/** Plus whether checks are available at all (didit-start "check": the keys are set). */
export type VerificationData = MyVerification & { available: boolean };

/** The database's refusal while verification_required is on (DZ-E6001). */
export const VERIFY_GATE_CODE = "DZ-E6001";
/** Settings > Verification. */
export const VERIFY_PATH = "/app/settings/verification";
/** Where the page to resume after verifying is kept while the person is at the provider's site. */
export const VERIFY_NEXT_KEY = "dzirent-verify-next";

const LABELS: Record<VerificationStatus, string> = {
  not_started: "Not verified",
  in_progress: "In progress",
  in_review: "In review",
  verified: "Verified",
  declined: "Not verified",
  expired: "Expired",
};

/** The status as people read it. */
export function verificationLabel(status: VerificationStatus | string | null | undefined): string {
  return LABELS[(status ?? "not_started") as VerificationStatus] ?? LABELS.not_started;
}

const tries = (n: number) => (n === 1 ? "1 try left" : `${n} tries left`);

/** One sentence under the status. */
export function verificationDetail(v: Pick<MyVerification, "status" | "attempts_left">, available = true): string {
  switch (v.status) {
    case "verified":
      return "Your ID is verified. People see a Verified badge on your listings, your studio and your chats.";
    case "in_review":
      return "Someone at Dzirent is checking your ID. You'll see the result here.";
    case "in_progress":
      return v.attempts_left > 0
        ? `Your check isn't finished yet. If you closed it, start again (${tries(v.attempts_left)}).`
        : "Your check isn't finished yet. If it doesn't finish, contact support to verify.";
    case "declined":
      return v.attempts_left > 0
        ? `Your ID couldn't be verified. You can try again (${tries(v.attempts_left)}).`
        : "Your ID couldn't be verified. Contact support to verify.";
    case "expired":
      return v.attempts_left > 0
        ? `Your verification ended before it was finished or has expired. You can verify again (${tries(v.attempts_left)}).`
        : "Your verification ended or expired. Contact support to verify.";
    default:
      return available
        ? "Verify your ID once and people see a Verified badge on your listings, your studio and your chats."
        : "ID verification isn't available yet.";
  }
}

/** The button's words, or null when there is no button (unavailable, verified, in review, no tries left). */
export function verificationAction(v: VerificationData): string | null {
  if (!v.available || !v.can_start) return null;
  if (v.status === "in_progress") return "Start again";
  if (v.status === "declined" || v.status === "expired") return "Try again";
  return "Verify ID";
}

/** Out of tries: the page points to support instead of a button. */
export function needsSupport(v: Pick<MyVerification, "status" | "can_start">): boolean {
  return !v.can_start && v.status !== "verified" && v.status !== "in_review";
}

/** True once the check has an outcome the "Checking…" page can show. */
export function settled(status: VerificationStatus | string | null | undefined): boolean {
  return status !== "in_progress" && status !== "not_started" && status != null;
}

/** True for the gate's refusal: its code, or a shown message that ends with it. */
export function isVerificationGate(error: { code?: string | null; message?: string | null } | string | null | undefined): boolean {
  if (!error) return false;
  if (typeof error === "string") return /\(DZ-E6001\)\s*$/.test(error) || error.startsWith("DZ-E6001:");
  return error.code === VERIFY_GATE_CODE || isVerificationGate(error.message ?? null);
}

/** A same-site path to come back to (anything else goes to Settings > Verification itself). */
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path?.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f\\]/.test(path) || /^\/(?:%2f|%5c)/i.test(path)) return null;
  return path.length <= 500 ? path : null;
}

/** Settings > Verification, remembering where to continue afterwards. */
export function verifyHref(next?: string | null): string {
  const back = safeReturnPath(next);
  return back ? `${VERIFY_PATH}?next=${encodeURIComponent(back)}` : VERIFY_PATH;
}
