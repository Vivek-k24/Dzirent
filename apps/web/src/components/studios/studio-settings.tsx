"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@dzirent/client";
import type { CurrentUser } from "@dzirent/client";
import { api } from "@/lib/api";
import { useSession } from "@/lib/store";
import { AuthDialog } from "../auth-dialog";
import { useRuntime } from "../providers";
import type { StudioSettings, StudioUpdate } from "./types";
import styles from "./studios.module.css";

const NAME_MAX = 80, BIO_MAX = 600;

function SettingsForm({ user, current }: { user: CurrentUser; current: StudioSettings | null }) {
  const client = useQueryClient(), runtime = useRuntime();
  const [name, setName] = useState(current?.display_name ?? user.lender_profile?.display_name ?? "");
  const [bio, setBio] = useState(current?.bio ?? ""), [isPublic, setIsPublic] = useState(current?.is_public ?? false);
  const save = useMutation({
    mutationFn: (body: StudioUpdate) => api<StudioSettings>("/me/studio", { method: "PUT", protected: true, body: JSON.stringify(body) }),
    onSuccess: async saved => {
      client.setQueryData(["my-studio", user.id, runtime.revision], saved);
      await client.invalidateQueries({ queryKey: ["studios"] });
      await client.invalidateQueries({ queryKey: ["studio", saved.handle] });
      // The form remounts on the new version; the toast and the version line confirm the save.
      useSession.getState().notify(current ? `Studio saved · version ${saved.version}.` : "Your Studio is created.");
    },
  });
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const nameError = !name.trim() ? "Enter a Studio name." : name.trim().length > NAME_MAX ? `Use at most ${NAME_MAX} characters.` : "";
  const bioError = bio.trim().length > BIO_MAX ? `Use at most ${BIO_MAX} characters.` : "";
  return <form className={styles.form} noValidate onSubmit={event => {
    event.preventDefault();
    if (nameError || bioError || save.isPending) return;
    save.mutate({ display_name: name.trim(), bio: bio.trim(), is_public: isPublic, expected_version: current?.version ?? null });
  }}>
    {current ? <dl className={styles.facts}>
      <div><dt className="sr-only">Public address</dt><dd>Public address: <code>/studios/{current.handle}</code> (stays the same if you rename your Studio)</dd></div>
      <div><dt className="sr-only">Published outfits</dt><dd>{current.published_product_count} published {current.published_product_count === 1 ? "outfit" : "outfits"} · Texas · version {current.version}</dd></div>
    </dl> : <p className={styles.muted}>You don’t have a Studio yet. Save these settings to create one; your public address is assigned automatically.</p>}
    <label className={styles.field} htmlFor="studio-name">Studio name
      <input id="studio-name" value={name} maxLength={NAME_MAX + 20} onChange={event => setName(event.target.value)} aria-invalid={!!nameError} aria-describedby="studio-name-help" autoComplete="off" />
      <span id="studio-name-help" className={nameError ? styles.error : styles.hint}>{nameError || `Up to ${NAME_MAX} characters.`}</span>
    </label>
    <label className={styles.field} htmlFor="studio-bio">Bio
      <textarea id="studio-bio" value={bio} maxLength={BIO_MAX + 50} onChange={event => setBio(event.target.value)} aria-invalid={!!bioError} aria-describedby="studio-bio-help" />
      <span id="studio-bio-help" className={bioError ? styles.error : styles.hint}>{bioError || `${bio.trim().length}/${BIO_MAX} characters. Don’t include addresses, phone numbers or email.`}</span>
    </label>
    <label className={styles.check} htmlFor="studio-public"><input id="studio-public" type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} />
      <span>Show my Studio in Explore Studios<br /><span className={styles.hint}>Only published outfits appear publicly. Drafts and archived listings stay private.</span></span>
    </label>
    {save.error ? <p className={styles.error} role="alert">{conflict ? "This Studio changed in another session. Reload the latest version before saving again." : save.error.message}</p> : null}
    <div className={styles.actions}>
      <button type="submit" className={styles.button} disabled={save.isPending}>{save.isPending ? "Saving…" : current ? "Save Studio" : "Create Studio"}</button>
      {conflict ? <button type="button" className={`${styles.button} ${styles.buttonOutline}`} onClick={() => void client.invalidateQueries({ queryKey: ["my-studio"] })}>Reload latest</button> : null}
      {current?.is_public ? <Link className={styles.link} href={`/studios/${current.handle}`}>View public Studio</Link> : null}
      <Link className={styles.link} href="/studios">Explore Studios</Link>
    </div>
  </form>;
}

function Settings({ user }: { user: CurrentUser }) {
  const runtime = useRuntime();
  const query = useQuery({
    queryKey: ["my-studio", user.id, runtime.revision],
    // No Studio yet is a real state, not an error: it opens the creation form.
    queryFn: async () => {
      try { return await api<StudioSettings>("/me/studio", { protected: true }); }
      catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
    },
    enabled: runtime.ready,
  });
  return <main id="main-content" className={styles.page}>
    <Link className={`${styles.link} ${styles.back}`} href="/lender/dashboard">← Lender dashboard</Link>
    <div className={styles.intro}><div>
      <p className={styles.eyebrow}>Your Studio</p>
      <h1 className={styles.title}>Studio settings</h1>
      <p className={styles.lede}>Your Studio is your public lender profile. It lists the outfits you have published.</p>
    </div></div>
    {runtime.demo ? <p className={styles.demoNote}>Demo identity. Changes last for this browser session only and are not saved to a hosted database.</p> : null}
    {runtime.error || query.error ? <div className={styles.state} role="alert"><h2>Studio settings didn’t load</h2><p>{runtime.error || query.error?.message}</p><button type="button" className={`${styles.button} ${styles.buttonOutline}`} onClick={() => void query.refetch()}>Retry</button></div>
      : query.data === undefined ? <div className={styles.state} aria-busy="true"><p>Loading your Studio…</p></div>
      : <SettingsForm key={query.data ? `${query.data.id}-${query.data.version}` : "new"} user={user} current={query.data} />}
  </main>;
}

export function StudioSettingsPage() {
  const user = useSession(s => s.user);
  if (!user?.lender_profile) return <><main id="main-content" className={styles.page}><div className={styles.state}><h1 className={styles.title}>Studio settings</h1><p>Sign in with a lender identity to manage your Studio.</p><Link className={styles.link} href="/studios">Explore Studios</Link></div></main><AuthDialog role="lender" action="login" /></>;
  return <Settings key={user.id} user={user} />;
}
