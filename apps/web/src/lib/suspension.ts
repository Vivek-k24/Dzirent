export function suspensionNotice(
  until: string | null | undefined,
  reason: string | null | undefined,
  now: number = Date.now(),
): string | null {
  const raw = until?.trim();
  if (!raw) return null;
  const why = reason?.trim().replace(/\.+$/, "")
    ? ` Reason: ${reason.trim().replace(/\.+$/, "")}.`
    : "";
  const contact = " Contact support if you think this is a mistake.";
  if (raw === "infinity") {
    return `Your account is suspended.${why}${contact}`;
  }
  const end = new Date(raw);
  if (isNaN(end.getTime()) || end.getTime() <= now) return null;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dateStr = `${monthNames[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  return `Your account is suspended until ${dateStr}.${why}${contact}`;
}
