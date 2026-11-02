"use client";
import { garmentKinds, templates, type Measurement } from "@/lib/workflows";
import type { ListingForm } from "@/lib/listing-form";
export type MeasurementRow = {
  label: string;
  value: string;
  unit: "cm" | "in";
};
export function measurementRows(kind: string, item: string): MeasurementRow[] {
  return (templates[kind === "one_size" ? item : kind] || []).map((label) => ({
    label,
    value: "",
    unit: "in",
  }));
}
export function usedMeasurements(rows: MeasurementRow[]): Measurement[] {
  return rows
    .filter(
      (r) =>
        r.value.trim() ||
        (r.label.trim() &&
          !Object.values(templates).some((labels) => labels.includes(r.label))),
    )
    .map((r) => ({
      label: r.label.trim(),
      value: Number(r.value),
      unit: r.unit,
    }));
}
const letters = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const range = (from: number, to: number, step = 1) =>
  Array.from(
    { length: Math.floor((to - from) / step) + 1 },
    (_, i) => from + i * step,
  );
export function SizeFields({
  form,
  onChange,
}: {
  form: ListingForm;
  onChange: (changes: Partial<ListingForm>) => void;
}) {
  const kind = form.garment_type;
  const [waist, inseam] = form.size_label.split(" x ");
  const suit = form.size_label.match(/^(\d+)([SRL])$/);
  const select = (
    label: string,
    value: string,
    options: string[],
    change: (v: string) => void,
  ) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => change(e.target.value)} required>
        <option value="">Choose</option>
        {value && !options.includes(value) && <option>{value}</option>}
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <label className="field">
        <span>Garment kind</span>
        <select
          value={kind}
          onChange={(e) =>
            onChange({
              garment_type: e.target.value,
              size_label: e.target.value === "one_size" ? "One size" : "",
            })
          }
          disabled={form.category === "Accessories"}
        >
          {Object.entries(garmentKinds).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {kind === "trousers" ? (
        <div className="form-pair">
          {select("Waist (in)", waist || "", range(26, 58).map(String), (v) =>
            onChange({ size_label: v + " x " + (inseam || "30") }),
          )}
          {select("Inseam (in)", inseam || "", range(26, 36).map(String), (v) =>
            onChange({ size_label: (waist || "32") + " x " + v }),
          )}
        </div>
      ) : kind === "suit" ? (
        <div className="form-pair">
          {select("Chest", suit?.[1] || "", range(34, 56, 2).map(String), (v) =>
            onChange({ size_label: v + (suit?.[2] || "R") }),
          )}
          {select("Length", suit?.[2] || "", ["S", "R", "L"], (v) =>
            onChange({ size_label: (suit?.[1] || "40") + v }),
          )}
        </div>
      ) : kind === "one_size" ? (
        <label className="field">
          <span>Size</span>
          <input value="One size" readOnly />
        </label>
      ) : (
        select(
          "Size",
          form.size_label,
          kind === "saree"
            ? range(30, 46, 2).map((n) => "Blouse " + n)
            : kind === "dress" || kind === "skirt"
              ? [...letters, ...range(0, 24, 2).map((n) => "US " + n)]
              : letters,
          (v) => onChange({ size_label: v }),
        )
      )}
    </>
  );
}
export function MeasurementFields({
  rows,
  onChange,
  other,
  onCopy,
}: {
  rows: MeasurementRow[];
  onChange: (rows: MeasurementRow[]) => void;
  other?: { title: string; listing_measurements: Measurement[] };
  onCopy: () => void;
}) {
  const unit = rows[0]?.unit || "in";
  return (
    <section className="editor-measurements">
      <h3>
        Garment measurements <small className="muted">(optional)</small>
      </h3>
      <p className="muted">Measure the piece, never your body.</p>
      {other && (
        <button type="button" className="text-button accent" onClick={onCopy}>
          Same as your {other.title}?
        </button>
      )}
      <div className="segmented-control">
        {(["in", "cm"] as const).map((u) => (
          <button
            type="button"
            key={u}
            aria-pressed={unit === u}
            onClick={() =>
              onChange(
                rows.map((r) => ({
                  ...r,
                  unit: u,
                  value:
                    r.value && Number.isFinite(Number(r.value))
                      ? String(
                          Math.round(
                            Number(r.value) *
                              (u === unit ? 1 : u === "cm" ? 2.54 : 1 / 2.54) *
                              10,
                          ) / 10,
                        )
                      : r.value,
                })),
              )
            }
          >
            {u === "in" ? "Inches" : "Centimeters"}
          </button>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="measurement-row">
          <label className="field">
            <span className="sr-only">Measurement label {i + 1}</span>
            <input
              aria-label={"Measurement label " + (i + 1)}
              value={r.label}
              maxLength={40}
              onChange={(e) =>
                onChange(
                  rows.map((m, j) =>
                    j === i ? { ...m, label: e.target.value } : m,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span className="sr-only">{r.label || "Value"}</span>
            <input
              aria-label={r.label || "Value"}
              inputMode="decimal"
              value={r.value}
              placeholder={unit}
              onChange={(e) =>
                onChange(
                  rows.map((m, j) =>
                    j === i ? { ...m, value: e.target.value } : m,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="text-button"
            aria-label={"Remove " + (r.label || "measurement")}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={rows.length >= 20}
        onClick={() => onChange([...rows, { label: "", value: "", unit }])}
      >
        + Add measurement
      </button>
    </section>
  );
}
