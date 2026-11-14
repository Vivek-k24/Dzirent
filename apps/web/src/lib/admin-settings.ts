// C4: how the admin Settings page shows and reads a setting. The database is the authority: it
// checks the type and range again (admin_set_setting, DZ-E5070 / DZ-E5072); these only give
// quick feedback and turn the form's text into the JSON value to send.

export type SettingType = "integer" | "number" | "boolean" | "timezone" | "choice" | "rate_limit";
export type AdminSetting = {
  key: string;
  label: string;
  area: "payments" | "rentals" | "rate_limits" | "retention";
  value: unknown;
  type: SettingType;
  unit: string | null;
  min: number | null;
  max: number | null;
  choices: string[] | null;
  description: string;
  decided_by: "owner" | "business_owner" | "attorney";
  affects_terms: boolean;
  updated_at: string;
};

export const areaTitles: [AdminSetting["area"], string][] = [
  ["payments", "Payments"],
  ["rentals", "Rentals"],
  ["rate_limits", "Rate limits"],
  ["retention", "Retention"],
];

export const decidedByLabels: Record<AdminSetting["decided_by"], string> = {
  owner: "Owner",
  business_owner: "Business owner",
  attorney: "Attorney",
};

/** The value as people read it: "48 hours", "On", "30 per minute", "America/Chicago". */
export function formatSettingValue(s: Pick<AdminSetting, "type" | "value" | "unit">, value: unknown = s.value): string {
  if (s.type === "boolean") return value === true ? "On" : "Off";
  if (s.type === "rate_limit") {
    const max = (value as { max?: unknown } | null)?.max;
    return `${String(max)} ${s.unit ?? ""}`.trim();
  }
  return s.unit ? `${String(value)} ${s.unit}` : String(value);
}

/** What the edit field starts with. */
export function settingInput(s: Pick<AdminSetting, "type" | "value">): string {
  if (s.type === "rate_limit") return String((s.value as { max?: unknown } | null)?.max ?? "");
  if (s.type === "boolean") return s.value === true ? "true" : "false";
  return String(s.value ?? "");
}

export type Parsed = { ok: true; value: unknown } | { ok: false; problem: string };

/**
 * The form's text as the JSON value admin_set_setting takes (a rate limit sends its new maximum),
 * or a plain problem to show before sending.
 */
export function parseSettingInput(s: Pick<AdminSetting, "type" | "min" | "max" | "unit" | "choices">, input: string): Parsed {
  const text = input.trim();
  const range = s.min != null && s.max != null ? `Enter a value from ${s.min} to ${s.max}${s.unit ? ` (${s.unit})` : ""}.` : "";
  switch (s.type) {
    case "integer":
    case "number":
    case "rate_limit": {
      if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, problem: "Enter a number." };
      const n = Number(text);
      if (s.type !== "number" && !Number.isInteger(n)) return { ok: false, problem: "Enter a whole number." };
      if ((s.min != null && n < s.min) || (s.max != null && n > s.max)) return { ok: false, problem: range };
      return { ok: true, value: n };
    }
    case "boolean":
      if (text !== "true" && text !== "false") return { ok: false, problem: "Choose on or off." };
      return { ok: true, value: text === "true" };
    case "timezone":
      if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$|^UTC$/.test(text)) return { ok: false, problem: "Enter a time zone name such as America/Chicago." };
      return { ok: true, value: text };
    case "choice":
      if (!(s.choices ?? []).includes(text)) return { ok: false, problem: `Choose one of: ${(s.choices ?? []).join(", ")}.` };
      return { ok: true, value: text };
  }
}

/** Settings in page order: by area, then by label. */
export function groupSettings(settings: AdminSetting[]): [string, AdminSetting[]][] {
  return areaTitles
    .map(([area, title]) => [title, settings.filter((s) => s.area === area).sort((a, b) => a.label.localeCompare(b.label))] as [string, AdminSetting[]])
    .filter(([, rows]) => rows.length > 0);
}
