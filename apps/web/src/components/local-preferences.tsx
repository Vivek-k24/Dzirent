"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Preferences = {
  theme: string;
  distance: string;
  measurements: string;
  rentalDays: number;
  distanceStep: number;
};
const defaults: Preferences = {
  theme: "system",
  distance: "mi",
  measurements: "in",
  rentalDays: 5,
  distanceStep: 2,
};
function read() {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("dzirent-web-settings") || "{}"),
    };
  } catch {
    return defaults;
  }
}
export function Appearance() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const prefs = read();
      document.documentElement.dataset.theme =
        prefs.theme === "dark" || (prefs.theme === "system" && media.matches)
          ? "dark"
          : "light";
    };
    apply();
    window.addEventListener("dzirent-settings-changed", apply);
    media.addEventListener("change", apply);
    return () => {
      window.removeEventListener("dzirent-settings-changed", apply);
      media.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
export function LocalPreferences() {
  const router = useRouter();
  const [prefs, setPrefs] = useState(defaults);
  useEffect(() => {
    Promise.resolve().then(() => setPrefs(read()));
  }, []);
  function change(next: Partial<Preferences>) {
    const value = { ...prefs, ...next };
    setPrefs(value);
    try {
      localStorage.setItem("dzirent-web-settings", JSON.stringify(value));
      localStorage.setItem("dzirent-measurement-unit", value.measurements);
      document.cookie =
        "dzirent-web-settings=" +
        encodeURIComponent(JSON.stringify(value)) +
        "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
      window.dispatchEvent(new Event("dzirent-settings-changed"));
      if (next.rentalDays)
        document.cookie = "dzirent-dates=; Path=/; Max-Age=0; SameSite=Lax";
      router.refresh();
    } catch {}
  }
  return (
    <>
      <h2>Settings</h2>
      <div className="preference-row">
        <strong>Theme</strong>
        <select
          aria-label="Theme"
          value={prefs.theme}
          onChange={(e) => change({ theme: e.target.value })}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="preference-row">
        <strong>App tour</strong>
        <button
          type="button"
          className="button secondary compact"
          onClick={() => window.dispatchEvent(new Event("dzirent-start-tour"))}
        >
          Take the tour
        </button>
      </div>
      <div className="preference-row">
        <strong>Distance</strong>
        <select
          aria-label="Distance unit"
          value={prefs.distance}
          onChange={(e) => change({ distance: e.target.value })}
        >
          <option value="mi">Miles</option>
          <option value="km">Kilometers</option>
        </select>
      </div>
      <div className="preference-row">
        <strong>Measurements</strong>
        <select
          aria-label="Measurement unit"
          value={prefs.measurements}
          onChange={(e) => change({ measurements: e.target.value })}
        >
          <option value="in">Inches</option>
          <option value="cm">Centimeters</option>
        </select>
      </div>
      <div className="preference-row">
        <strong>Default rental length</strong>
        <select
          aria-label="Default rental days"
          value={prefs.rentalDays}
          onChange={(e) => change({ rentalDays: Number(e.target.value) })}
        >
          {[3, 4, 5, 7].map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>
      </div>
      <div className="preference-row">
        <strong>Default distance</strong>
        <select
          aria-label="Default distance step"
          value={prefs.distanceStep}
          onChange={(e) => change({ distanceStep: Number(e.target.value) })}
        >
          {(prefs.distance === "mi" ? [1, 3, 5, 15] : [2, 5, 10, 25]).map(
            (n, i) => (
              <option key={n} value={i}>
                {n} {prefs.distance}
              </option>
            ),
          )}
        </select>
      </div>
      <p className="muted small">
        These preferences are saved on this browser.
      </p>
    </>
  );
}
