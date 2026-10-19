"use client";
import { useSyncExternalStore } from "react";
import { DayPicker } from "react-day-picker";
import { dateOnly, fourDayEnd, isoDate, rangeError } from "@dzirent/client";
import { format } from "date-fns";
import { presentation } from "@/lib/presentation";

const subscribe = (callback: () => void) => { const media = window.matchMedia("(max-width: 639px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };
const snapshot = () => window.matchMedia("(max-width: 639px)").matches;
export function DatePicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const small = useSyncExternalStore(subscribe, snapshot, () => false);
  const from = dateOnly(start) ?? undefined, to = dateOnly(end) ?? undefined;
  return <div className="date-picker"><p className="muted">Select a start date. Each demo rental is four days, including both dates.</p>
    <DayPicker mode="range" selected={{ from, to }} defaultMonth={from ?? dateOnly(presentation.start)!} numberOfMonths={small ? 1 : 2}
      onSelect={(_range, day) => { const start = isoDate(day); onChange(start, fourDayEnd(start)); }} showOutsideDays />
    {from && to ? <p className="date-summary">{format(from, "MMM d")} – {format(to, "MMM d, yyyy")} <span>· 4 days</span></p> : null}
    {rangeError(start, end) ? <p className="field-error" role="alert">{rangeError(start, end)}</p> : null}
    {start || end ? <button className="text-button" onClick={() => onChange("", "")}>Clear dates</button> : null}
  </div>;
}
