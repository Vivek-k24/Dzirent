"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";

export type Preferences = {
  theme: string;
  distance: string;
  measurements: string;
  rentalDays: number;
  distanceStep: number;
};

const defaults: Preferences = {
  theme: "light",
  distance: "mi",
  measurements: "in",
  rentalDays: 5,
  distanceStep: 2,
};

export function readPreferences(): Preferences {
  try {
    const raw = JSON.parse(
      localStorage.getItem("dzirent-web-settings") || "{}",
    );
    const theme = raw.theme === "dark" ? "dark" : "light";
    return {
      ...defaults,
      ...raw,
      theme,
    };
  } catch {
    return defaults;
  }
}

export function applyTheme(theme: string) {
  const resolved = theme === "dark" ? "dark" : "light";
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}

export function saveTheme(theme: string) {
  const resolved = theme === "dark" ? "dark" : "light";
  try {
    const current = readPreferences();
    const updated = { ...current, theme: resolved };
    localStorage.setItem("dzirent-web-settings", JSON.stringify(updated));
    document.cookie =
      "dzirent-web-settings=" +
      encodeURIComponent(JSON.stringify(updated)) +
      "; Path=/; Max-Age=31536000; SameSite=Lax" +
      (typeof location !== "undefined" && location.protocol === "https:"
        ? "; Secure"
        : "");
  } catch {}
  applyTheme(resolved);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("dzirent-theme-changed", { detail: { theme: resolved } }),
    );
    window.dispatchEvent(new Event("dzirent-settings-changed"));
  }
}

export function Appearance() {
  useEffect(() => {
    const apply = () => {
      const prefs = readPreferences();
      applyTheme(prefs.theme);
    };
    apply();
    window.addEventListener("dzirent-settings-changed", apply);
    window.addEventListener("dzirent-theme-changed", apply);
    return () => {
      window.removeEventListener("dzirent-settings-changed", apply);
      window.removeEventListener("dzirent-theme-changed", apply);
    };
  }, []);
  return null;
}

export function ThemeToggle() {
  const [theme, setThemeState] = useState<string>("light");

  useEffect(() => {
    const update = () => {
      const prefs = readPreferences();
      setThemeState(prefs.theme === "dark" ? "dark" : "light");
    };
    update();
    window.addEventListener("dzirent-settings-changed", update);
    window.addEventListener("dzirent-theme-changed", update);
    return () => {
      window.removeEventListener("dzirent-settings-changed", update);
      window.removeEventListener("dzirent-theme-changed", update);
    };
  }, []);

  function toggle() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    saveTheme(nextTheme);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    >
      <Icon name={isDark ? "sun" : "moon"} />
    </button>
  );
}

export function LocalPreferences() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences>(defaults);

  useEffect(() => {
    const update = () => setPrefs(readPreferences());
    update();
    window.addEventListener("dzirent-settings-changed", update);
    window.addEventListener("dzirent-theme-changed", update);
    return () => {
      window.removeEventListener("dzirent-settings-changed", update);
      window.removeEventListener("dzirent-theme-changed", update);
    };
  }, []);

  function change(next: Partial<Preferences>) {
    if (next.theme !== undefined) {
      saveTheme(next.theme);
      setPrefs((prev) => ({
        ...prev,
        theme: next.theme === "dark" ? "dark" : "light",
      }));
      return;
    }
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
