// C5: the transactional email templates (plain HTML and text, Dzirent's look). No imports, so the
// templates run the same in the send-email Edge Function (Deno) and in the Node unit test
// (email-templates.test.ts).
//
// What goes in: only the fields email_prepare returns (names, the listing title, dates, amounts,
// the chat's path). Never messages, a claim's reason, measurements or places: the templates read
// a fixed list of fields, so anything else in the data is ignored.

export type EmailTemplate =
  | "rental_request"
  | "request_accepted"
  | "request_declined"
  | "payment_receipt"
  | "pickup_reminder"
  | "return_reminder"
  | "claim_filed"
  | "claim_decided"
  | "account_deleted";

export const TEMPLATES: EmailTemplate[] = [
  "rental_request", "request_accepted", "request_declined", "payment_receipt", "pickup_reminder",
  "return_reminder", "claim_filed", "claim_decided", "account_deleted",
];

export type EmailData = Record<string, unknown>;
export type RenderedEmail = { subject: string; html: string; text: string };

const SITE = "https://dzirent.com";
const ACCENT = "#8e1538";
const ROSE = "#f8eff2";
const INK = "#111111";
const MUTED = "#666666";
const LINE = "#e6e6e6";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "$75.00". */
export function money(v: unknown): string {
  const n = num(v) ?? 0;
  return "$" + n.toFixed(2);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 5" for an ISO date (2026-11-05). */
export function dayLabel(v: unknown): string | null {
  const s = str(v);
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : null;
}

/** "Nov 5 - Nov 8". */
export function datesLabel(start: unknown, end: unknown): string | null {
  const a = dayLabel(start);
  const b = dayLabel(end);
  if (!a) return null;
  return !b || a === b ? a : `${a} - ${b}`;
}

/** "Nov 14, 3:00 PM" in the rental time zone (America/Chicago unless the data says otherwise). */
export function timeLabel(v: unknown, timezone: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: str(timezone) ?? "America/Chicago",
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
}

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A chat link on dzirent.com, only for a path the database wrote (/app/messages/<uuid>). */
function chatUrl(data: EmailData): string {
  const path = str(data.chat_path);
  return path && /^\/app\/messages\/[0-9a-f-]{36}$/i.test(path) ? SITE + path : SITE + "/app/messages";
}

type Body = {
  subject: string;
  heading: string;
  lines: string[];
  rows?: [string, string][];
  note?: string;
  button?: { label: string; url: string };
  /** false for the account-deleted email (there are no settings left to change). */
  settingsFooter?: boolean;
};

function layout(b: Body): RenderedEmail {
  const rows = b.rows ?? [];
  const htmlRows = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:15px">` +
      rows.map(([k, v], i) =>
        `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};color:${MUTED}${i === rows.length - 1 ? ";font-weight:bold;color:" + INK : ""}">${escapeHtml(k)}</td>` +
        `<td align="right" style="padding:8px 0;border-top:1px solid ${LINE}${i === rows.length - 1 ? ";font-weight:bold" : ""}">${escapeHtml(v)}</td></tr>`).join("") +
      `</table>`
    : "";
  const footer = b.settingsFooter === false
    ? "This email confirms an action on your Dzirent account."
    : "You get this email because you have a Dzirent account. Turn rental emails off in Settings > Notifications.";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(b.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${ROSE};font-family:Roboto,Helvetica,Arial,sans-serif;color:${INK}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ROSE}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid ${LINE}">` +
    `<tr><td style="padding:20px 24px;border-bottom:3px solid ${ACCENT}"><span style="font-size:22px;font-weight:bold;letter-spacing:0.5px;color:${ACCENT}">Dzirent</span></td></tr>` +
    `<tr><td style="padding:24px">` +
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${INK}">${escapeHtml(b.heading)}</h1>` +
    b.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(l)}</p>`).join("") +
    htmlRows +
    (b.note ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(b.note)}</p>` : "") +
    (b.button
      ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(b.button.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold;font-size:15px">${escapeHtml(b.button.label)}</a></p>`
      : "") +
    `</td></tr>` +
    `<tr><td style="padding:16px 24px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(footer)}<br>Dzirent never asks for your password or card number by email.</td></tr>` +
    `</table></td></tr></table></body></html>`;
  const text = [
    "Dzirent",
    "",
    b.heading,
    "",
    ...b.lines,
    ...(rows.length ? ["", ...rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(b.note ? ["", b.note] : []),
    ...(b.button ? ["", `${b.button.label}: ${b.button.url}`] : []),
    "",
    "--",
    footer,
    "Dzirent never asks for your password or card number by email.",
    "",
  ].join("\n");
  return { subject: b.subject, html, text };
}

/** The rendered email for [template], or null for an unknown template. */
export function renderEmail(template: string, data: EmailData): RenderedEmail | null {
  const title = str(data.listing_title) ?? "your rental";
  const other = str(data.other_name) ?? (data.role === "lender" ? "The renter" : "The lender");
  const hi = str(data.name) ? `Hi ${str(data.name)},` : "Hi,";
  const dates = datesLabel(data.start_date, data.end_date);
  const days = num(data.days);
  const daysText = days == null ? null : days === 1 ? "1 day" : `${days} days`;
  const summary = [dates, daysText, num(data.total) != null ? money(data.total) : null].filter(Boolean).join(" · ");
  const open = { label: "Open the chat", url: chatUrl(data) };
  const tz = data.timezone;
  const detail = str(data.detail);

  switch (template as EmailTemplate) {
    case "rental_request": {
      const by = timeLabel(data.expires_at, tz);
      return layout({
        subject: `Rental request from ${other}`,
        heading: `${other} wants to rent ${title}`,
        lines: [hi, summary ? `Dates and total: ${summary}.` : "Open the chat to see the dates.",
          by ? `Accept or decline by ${by}. Without an answer the request expires.` : "Accept or decline in the chat."],
        button: open,
      });
    }
    case "request_accepted": {
      const due = timeLabel(data.payment_due_at, tz);
      const waiting = data.status === "awaiting_payment" && data.payments_enabled === true;
      return layout({
        subject: `${other} accepted your request`,
        heading: `Your request for ${title} was accepted`,
        lines: [hi, summary ? `${summary}.` : "",
          waiting
            ? `Pay ${money(data.total)} in Dzirent${due ? ` by ${due}` : ""} to keep these dates. Unpaid rentals are cancelled automatically.`
            : "Arrange the pickup with the lender in the chat."].filter(Boolean),
        button: waiting ? { label: "Pay now", url: chatUrl(data) } : open,
      });
    }
    case "request_declined":
      return layout({
        subject: `${other} declined your request`,
        heading: `Your request for ${title} was declined`,
        lines: [hi, dates ? `The dates were ${dates}.` : "", "You can ask for other dates or find another piece on Dzirent."].filter(Boolean),
        button: { label: "Browse pieces", url: SITE },
      });
    case "payment_receipt": {
      const rows: [string, string][] = [];
      if (num(data.price_per_day) != null && days != null) rows.push([`${money(data.price_per_day)} × ${daysText}`, money(num(data.total))]);
      else rows.push(["Rental", money(data.total)]);
      if ((num(data.tax_amount) ?? 0) > 0) rows.push(["Sales tax", money(data.tax_amount)]);
      rows.push(["Paid", money((num(data.total) ?? 0) + (num(data.tax_amount) ?? 0))]);
      const deposit = num(data.deposit_amount);
      return layout({
        subject: `Receipt: ${title}`,
        heading: `Payment received for ${title}`,
        lines: [hi, `You paid ${other} for ${dates ?? "your rental"}.`],
        rows,
        note: [
          (num(data.fee_amount) ?? 0) > 0 ? `Dzirent's fee of ${money(data.fee_amount)} is included in the price.` : null,
          deposit && deposit > 0
            ? `A deposit of ${money(deposit)} will be held on your card at pickup. It is held, not charged, and released after the return unless a claim is decided.`
            : null,
          "Your card details stay with our payment processor. Dzirent never sees your card number.",
        ].filter(Boolean).join(" "),
        button: open,
      });
    }
    case "pickup_reminder":
      return layout({
        subject: `Pickup tomorrow: ${title}`,
        heading: "Pickup tomorrow",
        lines: [hi, data.role === "lender"
          ? `${other} picks up ${title} tomorrow${dates ? ` (${dates})` : ""}. Add at least 2 photos of the piece at pickup.`
          : `You pick up ${title} from ${other} tomorrow${dates ? ` (${dates})` : ""}. Agree on the time and place in the chat.`],
        button: open,
      });
    case "return_reminder": {
      const overdue = data.kind === "return_overdue";
      const end = dayLabel(data.end_date);
      return layout({
        subject: overdue ? `Return overdue: ${title}` : `Return due tomorrow: ${title}`,
        heading: overdue ? "Return overdue" : "Return due tomorrow",
        lines: [hi, overdue
          ? `${title} was due back${end ? ` ${end}` : ""}. Arrange the return in the chat.`
          : data.role === "lender"
            ? `${title} comes back tomorrow. Add at least 2 photos of the piece at the return.`
            : `${title} is due back to ${other} tomorrow.`],
        button: open,
      });
    }
    case "claim_filed":
      return layout({
        subject: `${other} filed a claim`,
        heading: `A claim on the deposit for ${title}`,
        lines: [hi, `${other} filed a damage claim${detail ? `: ${detail}` : ""}.`, "Open the chat to see it and accept or dispute it."],
        button: open,
      });
    case "claim_decided":
      return layout({
        subject: `Claim decided: ${title}`,
        heading: "The claim is decided",
        lines: [hi, detail ? `${detail}.` : "Open the chat to see the outcome.", "The rental is now completed."],
        button: open,
      });
    case "account_deleted":
      return layout({
        subject: "Your Dzirent account was deleted",
        heading: "Your account was deleted",
        lines: ["Hi,", "Your Dzirent account and its data were deleted as you asked. You won't get more emails from us.",
          "If you didn't ask for this, contact us at dzirent.com/support."],
        settingsFooter: false,
      });
    default:
      return null;
  }
}
