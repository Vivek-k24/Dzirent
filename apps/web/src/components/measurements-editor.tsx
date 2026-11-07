// apps/web/src/components/measurements-editor.tsx
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
import { Notice, WorkflowModal } from "./workflow-ui";

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
  const [consentAt, setConsentAt] = useState(
    initial?.measurements_consent_at || null,
  );
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [pendingMeasurements, setPendingMeasurements] = useState<Record<
    string,
    number | null
  > | null>(null);
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
      setConsentAt(initial?.measurements_consent_at || null);
    });
  }, [initial]);

  async function performSave(payload: Record<string, number | null>) {
    setBusy(true);
    try {
      await workflow("account/measurements", {
        ...payload,
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
  }

  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setNotice("");
          const measurements: Record<string, number | null> = {};
          let hasBodyMeasurement = false;
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
            hasBodyMeasurement = true;
          }

          if (hasBodyMeasurement && !consentAt) {
            setPendingMeasurements(measurements);
            setShowConsentModal(true);
            return;
          }

          await performSave(measurements);
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
          <div className="button-row" style={{ alignItems: "center" }}>
            <button className="button" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
            {consentAt && (
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() => setShowWithdrawModal(true)}
              >
                Withdraw consent
              </button>
            )}
          </div>
        </fieldset>
      </form>

      {showConsentModal && (
        <WorkflowModal
          title="Your measurements"
          busy={busy}
          onClose={() => {
            setShowConsentModal(false);
            setPendingMeasurements(null);
          }}
        >
          <p>
            Your measurements are private. We use them only to suggest pieces
            likely to fit you. They are never shown to anyone.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={async () => {
                if (!pendingMeasurements) return;
                setBusy(true);
                setError("");
                try {
                  await workflow("account/give_measurements_consent");
                  setConsentAt(new Date().toISOString());
                  await performSave(pendingMeasurements);
                  setShowConsentModal(false);
                  setPendingMeasurements(null);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Agree
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setShowConsentModal(false);
                setPendingMeasurements(null);
              }}
            >
              Not now
            </button>
          </div>
        </WorkflowModal>
      )}

      {showWithdrawModal && (
        <WorkflowModal
          title="Withdraw consent?"
          busy={busy}
          onClose={() => setShowWithdrawModal(false)}
        >
          <p>
            Your saved body measurements will be deleted, and &ldquo;Likely to
            fit you&rdquo; stops until you add them again.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await workflow("account/withdraw_measurements_consent");
                  setConsentAt(null);
                  setValues(
                    Object.fromEntries(bodyFields.map((k) => [k, ""])),
                  );
                  setShowWithdrawModal(false);
                  setNotice(
                    "Consent withdrawn. Your measurements were deleted.",
                  );
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Withdraw and delete
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setShowWithdrawModal(false)}
            >
              Cancel
            </button>
          </div>
        </WorkflowModal>
      )}
    </>
  );
}
