"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { categories, styles } from "@/lib/types";
import {
  type Profile,
  type OwnListing,
  type OwnPhoto,
  type Measurement,
  slots,
  slotNames,
  itemTypes,
  isoToday,
  declarationTexts,
  workflow,
} from "@/lib/workflows";
import { type ListingForm, validateListing } from "@/lib/listing-form";
import { compressPhoto, draftRead, draftWrite, draftClear } from "@/lib/drafts";
import { photoUrl } from "@/lib/supabase/config";
import { WorkflowModal, Notice } from "./workflow-ui";
import {
  SizeFields,
  MeasurementFields,
  measurementRows,
  usedMeasurements,
  type MeasurementRow,
} from "./listing-fields";
import { Icon } from "./icon";
type EditorPhoto = {
  token: string;
  slot: string;
  blob?: Blob;
  id?: string;
  storage_path?: string;
};
type Snapshot = {
  form: ListingForm;
  rows: MeasurementRow[];
  photos: EditorPhoto[];
  removed: string[];
  id: string;
  created: boolean;
  originalStatus: "active" | "paused";
};
type Props = {
  me: string;
  profile: Profile;
  listing: OwnListing | null;
  signed: boolean;
  otherListings: {
    id: string;
    title: string;
    garment_type: string;
    listing_measurements: Measurement[];
  }[];
};
function initialForm(listing: OwnListing | null): ListingForm {
  const start = isoToday();
  const end = new Date(start + "T12:00:00");
  end.setDate(end.getDate() + 29);
  return {
    title: listing?.title || "",
    category: listing?.category || "",
    description: listing?.description || "",
    item_type: listing?.item_type || "",
    garment_type: listing?.garment_type || "top",
    size_label: listing?.size_label || "",
    price_usd: listing ? String(listing.price_usd) : "",
    price_note: listing?.price_note || "",
    retail_value: listing?.retail_value ? String(listing.retail_value) : "",
    deposit_note: listing?.deposit_note || "",
    listing_styles: listing?.listing_styles || [],
    measurements: listing?.measurements || [],
    availability: listing?.availability?.length
      ? listing.availability
      : [{ start_date: start, end_date: end.toLocaleDateString("en-CA") }],
    accessory_confirmed: false,
  };
}
function EditorPhotoPreview({ photo }: { photo: EditorPhoto }) {
  const [url, setUrl] = useState(photoUrl(photo.storage_path || null));
  useEffect(() => {
    if (!photo.blob) return;
    const url = URL.createObjectURL(photo.blob);
    Promise.resolve().then(() => setUrl(url));
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);
  return url ? (
    <Image
      src={url}
      alt={slotNames[slots.indexOf(photo.slot)] + " photo"}
      fill
      unoptimized
      sizes="160px"
    />
  ) : (
    <Icon name="hanger" />
  );
}
export function ListingEditor({
  me,
  profile,
  listing,
  signed: initialSigned,
  otherListings,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialForm(listing));
  const [rows, setRows] = useState<MeasurementRow[]>(() =>
    listing?.measurements.length
      ? listing.measurements.map((m) => ({ ...m, value: String(m.value) }))
      : measurementRows(
          listing?.garment_type || "top",
          listing?.item_type || "",
        ),
  );
  const [photos, setPhotos] = useState<EditorPhoto[]>(
    () =>
      listing?.photos.map((p) => ({
        token: p.id,
        slot: p.slot || slots[p.position] || "front",
        id: p.id,
        storage_path: p.storage_path,
      })) || [],
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [id, setId] = useState(() => listing?.id || crypto.randomUUID());
  const [created, setCreated] = useState(Boolean(listing));
  const [originalStatus, setOriginalStatus] = useState<"active" | "paused">(
    listing?.status || "active",
  );
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [signed, setSigned] = useState(initialSigned);
  const [signing, setSigning] = useState(false);
  const [ticks, setTicks] = useState(declarationTexts.map(() => false));
  const [legalName, setLegalName] = useState("");
  const [pendingDraft, setPendingDraft] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const finished = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const targetSlot = useRef("front");
  const key = "listing:" + me + ":" + (listing?.id || "new");
  const snapshot: Snapshot = {
    form,
    rows,
    photos,
    removed,
    id,
    created,
    originalStatus,
  };
  useEffect(() => {
    let live = true;
    draftRead<Snapshot>(key)
      .then((d) => {
        if (!live) return;
        if (listing) {
          void draftClear(key);
          setReady(true);
        } else if (
          d &&
          (d.form.title.trim() ||
            d.photos.length ||
            d.form.description.trim() ||
            d.form.category)
        )
          setPendingDraft(d);
        else setReady(true);
      })
      .catch(() => {
        if (live) {
          setReady(true);
          setDraftNotice("Drafts could not be saved on this browser.");
        }
      });
    return () => {
      live = false;
    };
  }, [key, listing]);
  useEffect(() => {
    if (!ready || busy || finished.current) return;
    const timer = setTimeout(() => {
      draftWrite(key, {
        form,
        rows,
        photos,
        removed,
        id,
        created,
        originalStatus,
      })
        .then(() => {
          if (!finished.current) setDraftNotice("Draft saved on this browser");
        })
        .catch(() =>
          setDraftNotice("Could not save your draft. Keep this page open."),
        );
    }, 600);
    return () => clearTimeout(timer);
  }, [
    key,
    ready,
    busy,
    form,
    rows,
    photos,
    removed,
    id,
    created,
    originalStatus,
  ]);
  function change(changes: Partial<ListingForm>) {
    if (changes.garment_type && changes.garment_type !== form.garment_type)
      setRows(measurementRows(changes.garment_type, form.item_type));
    if (changes.item_type && changes.item_type !== form.item_type)
      setRows(measurementRows("one_size", changes.item_type));
    if (changes.category && changes.category !== form.category) {
      changes.item_type = "";
      if (changes.category === "Accessories") {
        changes.garment_type = "one_size";
        changes.size_label = "One size";
        setRows([]);
      } else if (form.category === "Accessories") {
        changes.garment_type = "top";
        changes.size_label = "";
        setRows(measurementRows("top", ""));
      }
    }
    setForm((old) => ({ ...old, ...changes }));
    setError("");
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      let next = [...photos];
      const deleted = [...removed];
      for (const file of Array.from(files)) {
        const slot =
          files.length === 1
            ? targetSlot.current
            : [
                "front",
                "back",
                "close_up",
                "extra_1",
                "extra_2",
                "size_tag",
              ].find((s) => !next.some((p) => p.slot === s));
        if (!slot) break;
        const blob = await compressPhoto(file);
        const old = next.find((p) => p.slot === slot);
        if (old?.id) deleted.push(old.id);
        next = next.filter((p) => p.slot !== slot);
        next.push({ token: crypto.randomUUID(), slot, blob });
      }
      setPhotos(next);
      setRemoved(deleted);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }
  function removePhoto(index: number) {
    const old = photos[index];
    if (old.id) setRemoved((v) => [...v, old.id!]);
    setPhotos((p) => p.filter((_, i) => i !== index));
  }
  function movePhoto(index: number, delta: number) {
    const next = [...photos];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setPhotos(next);
  }
  async function keepDraft(s: Snapshot) {
    await draftWrite(key, s).catch(() => {});
  }
  async function publish() {
    const nextForm = { ...form, measurements: usedMeasurements(rows) };
    const validation = validateListing(nextForm);
    if (validation) {
      setError(validation);
      return;
    }
    if (!photos.length) {
      setStep(1);
      setError("Add at least one photo before publishing.");
      return;
    }
    if (form.category === "Accessories" && !signed) {
      setSigning(true);
      return;
    }
    if (
      !listing &&
      (profile.approx_lat == null || profile.approx_lng == null)
    ) {
      setError("Set your location before publishing.");
      return;
    }
    setBusy(true);
    setError("");
    setFailed(false);
    const progress = {
      ...snapshot,
      form: nextForm,
      photos: [...photos],
      removed: [...removed],
    };
    try {
      setPhase("Saving listing details");
      await workflow("listings/save", { id, form: nextForm });
      setCreated(true);
      progress.created = true;
      await keepDraft(progress);
      setPhase("Removing photos");
      for (const photoId of [...progress.removed]) {
        await workflow("photo/" + id + "/delete", { id: photoId });
        progress.removed = progress.removed.filter((p) => p !== photoId);
        setRemoved([...progress.removed]);
        await keepDraft(progress);
      }
      setPhase("Uploading photos");
      for (let i = 0; i < progress.photos.length; i++) {
        const p = progress.photos[i];
        if (p.id) continue;
        if (!p.blob) throw new Error("Choose this photo again.");
        const body = new FormData();
        body.set("photo", p.blob, "photo.jpg");
        body.set("slot", p.slot);
        body.set("token", p.token);
        const response = await fetch("/api/workflows/photo/" + id + "/upload", {
          method: "POST",
          body,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not upload this photo.");
        const saved = result as OwnPhoto;
        progress.photos[i] = {
          ...p,
          id: saved.id,
          storage_path: saved.storage_path,
        };
        setPhotos([...progress.photos]);
        await keepDraft(progress);
      }
      setPhase("Saving size, price and dates");
      await workflow("listings/finish", {
        id,
        form: nextForm,
        photos: progress.photos.map((p) => ({ id: p.id, slot: p.slot })),
        status: originalStatus,
      });
      finished.current = true;
      await draftClear(key).catch(() => {});
      router.push("/app/closet");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setFailed(true);
      setPhase("");
    } finally {
      setBusy(false);
    }
  }
  async function startOver() {
    setBusy(true);
    setError("");
    try {
      if (pendingDraft?.created && !listing)
        await workflow("listings/" + pendingDraft.id + "/delete", {});
      await draftClear(key);
      setPendingDraft(null);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function continueDraft() {
    if (!pendingDraft) return;
    setForm({ ...pendingDraft.form, accessory_confirmed: false });
    setRows(pendingDraft.rows);
    setPhotos(pendingDraft.photos);
    setRemoved(pendingDraft.removed);
    setId(pendingDraft.id);
    setCreated(pendingDraft.created);
    setOriginalStatus(pendingDraft.originalStatus);
    setPendingDraft(null);
    setReady(true);
  }
  const other = otherListings.find(
    (l) =>
      l.garment_type === form.garment_type && l.listing_measurements.length > 0,
  );
  const field = (
    name: keyof ListingForm,
    label: string,
    maxLength?: number,
    placeholder?: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        value={String(form[name])}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => change({ [name]: e.target.value })}
      />
    </label>
  );

  if (profile.role === "renter")
    return (
      <div className="page-width workflow-page narrow">
        <span className="eyebrow accent">YOUR PROFILE</span>
        <h1>List a piece</h1>
        <p>Switch to Lend or Both in your profile before listing a piece.</p>
        <Link href="/app/settings" className="button">
          Profile &amp; settings <Icon name="arrow" />
        </Link>
      </div>
    );
  return (
    <div className="page-width workflow-page editor-page">
      <div className="workflow-heading">
        <div>
          <span className="eyebrow accent">YOUR NEIGHBORHOOD WARDROBE</span>
          <h1>{listing ? "Edit listing" : "List a piece"}</h1>
        </div>
        <Link href="/app/closet" className="text-link">
          My Closet <Icon name="chevron" />
        </Link>
      </div>
      <div className="editor-progress" aria-label={"Step " + step + " of 2"}>
        {["Photos and details", "Size, price and dates"].map((title, i) => (
          <button
            type="button"
            key={title}
            className={step === i + 1 ? "current" : ""}
            aria-current={step === i + 1 ? "step" : undefined}
            disabled={busy || i + 1 > step}
            onClick={() => setStep(i + 1)}
          >
            <span>{i + 1}</span>
            {title}
          </button>
        ))}
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 1) {
            if (form.title.trim().length < 3 || form.title.trim().length > 80) {
              setError("Title must be 3 to 80 characters.");
              return;
            }
            if (!categories.includes(form.category)) {
              setError("Choose a category.");
              return;
            }
            if (
              form.category === "Accessories" &&
              !itemTypes.includes(form.item_type)
            ) {
              setError("Choose an item type for Accessories.");
              return;
            }
            if (form.description.length > 1000) {
              setError("Description can be up to 1000 characters.");
              return;
            }
            if (!photos.length) {
              setError("Add at least one photo before publishing.");
              return;
            }
            if (form.category === "Accessories" && !signed) {
              setSigning(true);
              return;
            }
            setError("");
            setStep(2);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else void publish();
        }}
      >
        <fieldset disabled={busy || !ready} className="workflow-fieldset">
          {step === 1 ? (
            <>
              <section className="editor-section">
                <div className="section-title">
                  <div>
                    <h2>Photos</h2>
                    <p className="muted">
                      Show the piece as it is. Add up to 6 photos.
                    </p>
                  </div>
                </div>
                <input
                  className="sr-only"
                  ref={picker}
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label="Choose listing photos"
                  onChange={(e) => void addFiles(e.target.files)}
                />
                <input
                  className="sr-only"
                  ref={camera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Take a listing photo"
                  onChange={(e) => void addFiles(e.target.files)}
                />
                <div className="editor-photos">
                  {photos.map((p, i) => (
                    <article className="editor-photo" key={p.token}>
                      <div className="editor-photo-image">
                        <EditorPhotoPreview photo={p} />
                        <span>{slotNames[slots.indexOf(p.slot)]}</span>
                      </div>
                      <div className="photo-controls">
                        <button
                          type="button"
                          aria-label={
                            "Move " +
                            slotNames[slots.indexOf(p.slot)] +
                            " earlier"
                          }
                          disabled={i === 0}
                          onClick={() => movePhoto(i, -1)}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          aria-label={
                            "Move " +
                            slotNames[slots.indexOf(p.slot)] +
                            " later"
                          }
                          disabled={i === photos.length - 1}
                          onClick={() => movePhoto(i, 1)}
                        >
                          →
                        </button>
                        <button
                          type="button"
                          aria-label={
                            "Delete " +
                            slotNames[slots.indexOf(p.slot)] +
                            " photo"
                          }
                          onClick={() => removePhoto(i)}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                  {slots
                    .filter((s) => !photos.some((p) => p.slot === s))
                    .map((slot) => (
                      <div className="empty-photo-slot" key={slot}>
                        <Icon name="plus" />
                        <strong>{slotNames[slots.indexOf(slot)]}</strong>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            targetSlot.current = slot;
                            picker.current?.click();
                          }}
                        >
                          Choose photo
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            targetSlot.current = slot;
                            camera.current?.click();
                          }}
                        >
                          Take photo
                        </button>
                      </div>
                    ))}
                </div>
                <p className="muted small">
                  Your first photo is the cover. Use the arrows to reorder.
                </p>
              </section>
              <section className="editor-section">
                <h2>Details</h2>
                {field("title", "Title", 80, "e.g. Navy linen blazer")}
                <label className="field">
                  <span>Category</span>
                  <select
                    value={form.category}
                    onChange={(e) => change({ category: e.target.value })}
                  >
                    <option value="">Choose a category</option>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {form.category === "Accessories" && (
                  <>
                    <label className="field">
                      <span>Item type</span>
                      <select
                        value={form.item_type}
                        onChange={(e) => change({ item_type: e.target.value })}
                      >
                        <option value="">Choose an item type</option>
                        {itemTypes.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <div className="policy-note">
                      <strong>Accessory declaration</strong>
                      <p>
                        {signed
                          ? "Your declaration is signed."
                          : "Before you list jewelry or accessories, please confirm the accessory declaration."}
                      </p>
                      {!signed && (
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => setSigning(true)}
                        >
                          Read and sign
                        </button>
                      )}
                    </div>
                  </>
                )}
                <label className="field">
                  <span>Description (optional)</span>
                  <textarea
                    maxLength={1000}
                    rows={4}
                    value={form.description}
                    onChange={(e) => change({ description: e.target.value })}
                  />
                  <small>{form.description.length}/1000</small>
                </label>
                <h3>
                  Styles <small className="muted">(up to 3)</small>
                </h3>
                <div className="choice-chips">
                  {styles.map((s) => (
                    <button
                      type="button"
                      key={s}
                      aria-pressed={form.listing_styles.includes(s)}
                      disabled={
                        !form.listing_styles.includes(s) &&
                        form.listing_styles.length >= 3
                      }
                      onClick={() =>
                        change({
                          listing_styles: form.listing_styles.includes(s)
                            ? form.listing_styles.filter((t) => t !== s)
                            : [...form.listing_styles, s],
                        })
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="editor-section">
                <h2>Size</h2>
                <SizeFields form={form} onChange={change} />
                <MeasurementFields
                  rows={rows}
                  onChange={setRows}
                  other={other}
                  onCopy={() => {
                    if (other)
                      setRows(
                        other.listing_measurements.map((m) => ({
                          ...m,
                          value: String(m.value),
                        })),
                      );
                  }}
                />
              </section>
              <section className="editor-section">
                <h2>Price and availability</h2>
                <label className="field">
                  <span>Price per rental (USD)</span>
                  <input
                    inputMode="decimal"
                    value={form.price_usd}
                    placeholder="25 or 25.50"
                    onChange={(e) => change({ price_usd: e.target.value })}
                  />
                </label>
                <div className="section-title">
                  <h3>Availability</h3>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      change({ availability: initialForm(null).availability })
                    }
                  >
                    Next 30 days
                  </button>
                </div>
                <div className="form-pair">
                  <label className="field">
                    <span>From</span>
                    <input
                      type="date"
                      min={isoToday()}
                      value={form.availability[0]?.start_date || ""}
                      onChange={(e) =>
                        change({
                          availability: [
                            {
                              start_date: e.target.value,
                              end_date:
                                form.availability[0]?.end_date ||
                                e.target.value,
                            },
                            ...form.availability.slice(1),
                          ],
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input
                      type="date"
                      min={form.availability[0]?.start_date || isoToday()}
                      value={form.availability[0]?.end_date || ""}
                      onChange={(e) =>
                        change({
                          availability: [
                            {
                              start_date:
                                form.availability[0]?.start_date ||
                                e.target.value,
                              end_date: e.target.value,
                            },
                            ...form.availability.slice(1),
                          ],
                        })
                      }
                    />
                  </label>
                </div>
                {form.availability.length > 1 && (
                  <p className="muted">
                    Your other saved availability dates will be kept.
                  </p>
                )}
                {form.category === "Accessories" && (
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={form.accessory_confirmed}
                      onChange={(e) =>
                        change({ accessory_confirmed: e.target.checked })
                      }
                    />
                    <span>
                      This item isn&apos;t fine jewelry or precious metal and is
                      worth under $300.
                    </span>
                  </label>
                )}
                <details className="more-options">
                  <summary>More options</summary>
                  {field("price_note", "Price details (optional)", 60)}
                  {field("retail_value", "Retail value (USD, optional)")}
                  {Number(form.retail_value) >= 150 && (
                    <p className="policy-note">
                      This is a valuable piece. Consider asking renters for a
                      refundable deposit.
                    </p>
                  )}
                  {field(
                    "deposit_note",
                    "Deposit note (optional)",
                    120,
                    "e.g. $40 refundable deposit, cash at pickup",
                  )}
                </details>
              </section>
            </>
          )}
          <Notice message={error} error />
          {phase && (
            <p role="status" className="saving-state">
              {phase}...
            </p>
          )}
          {failed && (
            <div className="policy-note">
              Your listing stays paused while the save is incomplete.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => void publish()}
              >
                Retry
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setFailed(false);
                  setError("");
                }}
              >
                Back to edit
              </button>
            </div>
          )}
          <div className="editor-bottom">
            <span className="muted small" role="status">
              {draftNotice}
            </span>
            <div className="button-row">
              {step === 2 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                >
                  Back
                </button>
              )}
              <button className="button" disabled={busy}>
                {busy
                  ? "Saving..."
                  : step === 1
                    ? "Next"
                    : listing
                      ? "Save changes"
                      : "Publish listing"}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        </fieldset>
      </form>
      {pendingDraft && (
        <WorkflowModal
          title="Continue your draft?"
          onClose={() => {}}
          busy={busy}
        >
          <p>Your listing draft is saved on this browser.</p>
          <Notice message={error} error />
          <div className="button-row">
            <button className="button" disabled={busy} onClick={continueDraft}>
              Continue
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void startOver()}
            >
              Start over
            </button>
          </div>
        </WorkflowModal>
      )}
      {signing && (
        <WorkflowModal
          title="Accessory declaration"
          busy={busy}
          onClose={() => setSigning(false)}
        >
          <p>Before you list jewelry or accessories, please confirm:</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await workflow("declaration", { name: legalName, ticks });
                setSigned(true);
                setSigning(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="workflow-fieldset" disabled={busy}>
              {declarationTexts.map((text, i) => (
                <label key={text} className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={ticks[i]}
                    onChange={(e) =>
                      setTicks((old) =>
                        old.map((t, j) => (j === i ? e.target.checked : t)),
                      )
                    }
                    required
                  />
                  <span>{text}</span>
                </label>
              ))}
              <label className="field">
                <span>Full legal name</span>
                <input
                  value={legalName}
                  maxLength={120}
                  onChange={(e) => setLegalName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </label>
              <p className="muted small">
                Your typed name and these ticks are your signature. We keep this
                record with your email, the time and your city.
              </p>
              <Notice message={error} error />
              <button
                className="button full"
                disabled={busy || ticks.some((t) => !t)}
              >
                I agree and sign
              </button>
            </fieldset>
          </form>
        </WorkflowModal>
      )}
    </div>
  );
}
