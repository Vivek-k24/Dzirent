"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { workflow, studioStyles, type Profile } from "@/lib/workflows";
import { Notice } from "./workflow-ui";
const handleFor = (s: string) =>
  s
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\s/g, ".")
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
export function StudioEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    studio_name: profile.studio_name || "",
    studio_handle:
      profile.studio_handle ||
      handleFor(profile.studio_name || profile.display_name),
    studio_bio: profile.studio_bio || "",
    pickup_area: profile.pickup_area || "",
    style_tags: profile.style_tags || [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (profile.role === "renter")
    return (
      <>
        <h2>My studio</h2>
        <p>Switch to Lend or Both in your profile to set up your studio.</p>
        <Link className="button" href="/app/settings">
          Profile
        </Link>
      </>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
          await workflow("account/studio", form);
          setNotice("Studio saved");
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="workflow-fieldset">
        <div className="section-title">
          <h2>My studio</h2>
          {profile.studio_handle && (
            <Link
              href={"/studio/" + profile.studio_handle}
              className="text-link accent"
            >
              View studio →
            </Link>
          )}
        </div>
        <label className="field">
          <span>Studio name (optional)</span>
          <input
            maxLength={40}
            value={form.studio_name}
            placeholder={profile.display_name}
            onChange={(e) => setForm({ ...form, studio_name: e.target.value })}
          />
          <small>{form.studio_name.length}/40</small>
        </label>
        <label className="field">
          <span>Handle (optional)</span>
          <input
            maxLength={30}
            value={form.studio_handle}
            placeholder="your.studio"
            onChange={(e) =>
              setForm({ ...form, studio_handle: handleFor(e.target.value) })
            }
          />
          <small>3-30 lowercase letters, numbers, dots or underscores.</small>
        </label>
        <label className="field">
          <span>Bio (optional)</span>
          <textarea
            maxLength={200}
            rows={4}
            value={form.studio_bio}
            onChange={(e) => setForm({ ...form, studio_bio: e.target.value })}
          />
          <small>{form.studio_bio.length}/200</small>
        </label>
        <label className="field">
          <span>Pickup area (optional)</span>
          <input
            maxLength={60}
            value={form.pickup_area}
            placeholder="e.g. East Austin"
            onChange={(e) => setForm({ ...form, pickup_area: e.target.value })}
          />
          <small>A neighborhood, never your address.</small>
        </label>
        <h3>
          Styles <small className="muted">(up to 5)</small>
        </h3>
        <div className="choice-chips">
          {studioStyles.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={form.style_tags.includes(s)}
              disabled={
                !form.style_tags.includes(s) && form.style_tags.length >= 5
              }
              onClick={() =>
                setForm({
                  ...form,
                  style_tags: form.style_tags.includes(s)
                    ? form.style_tags.filter((t) => t !== s)
                    : [...form.style_tags, s],
                })
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
