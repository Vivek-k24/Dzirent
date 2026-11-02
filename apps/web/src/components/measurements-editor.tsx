"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bodyFields,
  bodyLabels,
  workflow,
  type PrivateProfile,
} from "@/lib/workflows";
import { styles } from "@/lib/types";
import { Notice } from "./workflow-ui";
export function MeasurementsEditor({
  initial,
}: {
  initial: PrivateProfile | null;
}) {
  const router = useRouter();
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      bodyFields.map((k) => [
        k,
        initial?.[k] ? String(Math.round((initial[k]! / 2.54) * 10) / 10) : "",
      ]),
    ),
  );
  const [fit, setFit] = useState(initial?.fit_profile || null);
  const [interests, setInterests] = useState(initial?.style_interests || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        if (localStorage.getItem("dzirent-measurement-unit") === "cm") {
          setUnit("cm");
          setValues(
            Object.fromEntries(
              bodyFields.map((k) => [
                k,
                initial?.[k] ? String(initial[k]) : "",
              ]),
            ),
          );
        }
      } catch {}
    });
  }, [initial]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");
        const measurements: Record<string, number | null> = {};
        for (const key of bodyFields) {
          const text = values[key].trim();
          if (!text) {
            measurements[key] = null;
            continue;
          }
          if (!/^\d+(\.\d+)?$/.test(text)) {
            setError("Enter a number, like 36 or 36.5.");
            return;
          }
          const cm =
            Math.round(Number(text) * (unit === "in" ? 2.54 : 1) * 10) / 10;
          if (cm <= 0 || cm >= 300) {
            setError("That doesn't look right. Check the number and unit.");
            return;
          }
          measurements[key] = cm;
        }
        setBusy(true);
        try {
          await workflow("account/measurements", {
            ...measurements,
            fit_profile: fit,
            style_interests: interests,
          });
          setNotice("Measurements saved");
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="workflow-fieldset">
        <h2>My measurements</h2>
        <p>
          We only use your measurements to make your search easier and show
          pieces likely to fit you. They&apos;re private, so no one else can see
          them. If you&apos;re a lender, your listings only show the
          garment&apos;s measurements, never your body measurements.
        </p>
        <h3>
          I&apos;m a <small className="muted">(optional)</small>
        </h3>
        <div className="choice-chips">
          {(["man", "woman"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={fit === p}
              onClick={() => setFit(fit === p ? null : p)}
            >
              {p === "man" ? "Man" : "Woman"}
            </button>
          ))}
        </div>
        <div className="segmented-control">
          {(["in", "cm"] as const).map((u) => (
            <button
              type="button"
              key={u}
              aria-pressed={unit === u}
              onClick={() => {
                if (u === unit) return;
                setValues(
                  Object.fromEntries(
                    bodyFields.map((k) => [
                      k,
                      values[k] && Number.isFinite(Number(values[k]))
                        ? String(
                            Math.round(
                              Number(values[k]) *
                                (u === "cm" ? 2.54 : 1 / 2.54) *
                                10,
                            ) / 10,
                          )
                        : values[k],
                    ]),
                  ),
                );
                setUnit(u);
                try {
                  localStorage.setItem("dzirent-measurement-unit", u);
                } catch {}
              }}
            >
              {u === "in" ? "Inches" : "Centimeters"}
            </button>
          ))}
        </div>
        <div className="measurement-input-grid">
          {bodyFields.map((key, i) => (
            <label className="field" key={key}>
              <span>
                {i === 0 && fit === "woman" ? "Bust" : bodyLabels[i]}{" "}
                <small>({unit})</small>
              </span>
              <input
                inputMode="decimal"
                value={values[key]}
                placeholder="Optional"
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <h3>Styles you&apos;re interested in</h3>
        <p className="muted">
          Private. Only used to suggest pieces you might like; we never hide
          anything based on it.
        </p>
        <div className="choice-chips">
          {styles.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={interests.includes(s)}
              onClick={() =>
                setInterests((old) =>
                  old.includes(s) ? old.filter((t) => t !== s) : [...old, s],
                )
              }
            >
              {s}
            </button>
          ))}
        </div>
        <Notice message={error} error />
        <Notice message={notice} />
        <button className="button" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
      </fieldset>
    </form>
  );
}
