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
  WorkflowClientError,
} from "@/lib/workflows";
import { type ListingForm, validateListing } from "@/lib/listing-form";
import { compressPhoto, draftRead, draftWrite, draftClear } from "@/lib/drafts";
import { photoUrl } from "@/lib/supabase/config";
import { browserClient } from "@/lib/supabase/client";
import { WorkflowModal, Notice } from "./workflow-ui";
import {
  SizeFields,
  MeasurementFields,
  measurementRows,
  usedMeasurements,
  type MeasurementRow,
} from "./listing-fields";
import { Icon } from "./icon";

type ScanSuggestions = {
  title?: string;
  category?: string;
  item_type?: string;
  garment_type?: string;
  description?: string;
  styles?: string[];
};

type ListingScan = {
  id: string;
  status: string;
  verdict?: string | null;
  reason?: string | null;
  admin_decision?: string | null;
  suggestions?: ScanSuggestions | null;
};

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
    const objectUrl = URL.createObjectURL(photo.blob);
    Promise.resolve().then(() => setUrl(objectUrl));
    return () => URL.revokeObjectURL(objectUrl);
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

function PhotoCheckBanner({
  phase,
  scan,
  onRetry,
  onReplacePhotos,
}: {
  phase: string;
  scan: ListingScan | null;
  onRetry: () => void;
  onReplacePhotos: () => void;
}) {
  if (phase === "checking" || phase === "uploading") {
    return (
      <div
        className="policy-note"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          margin: "16px 0",
        }}
      >
        <span
          className="spinner"
          style={{
            display: "inline-block",
            width: "14px",
            height: "14px",
            border: "2px solid #ccc",
            borderTopColor: "var(--accent, #666)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <span>Checking your photos…</span>
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div className="policy-note notice error" style={{ margin: "16px 0" }}>
        <p>We couldn&apos;t check the photos right now.</p>
        <button
          type="button"
          className="text-button"
          onClick={onRetry}
          style={{ marginTop: "4px" }}
        >
          Check again
        </button>
      </div>
    );
  }
  if (scan) {
    const isApproved = scan.admin_decision === "approved";
    const isRejected =
      scan.admin_decision === "rejected" ||
      (!scan.admin_decision && scan.verdict === "rejected");
    const isAllowed =
      isApproved || (!scan.admin_decision && scan.verdict === "allowed");

    if (isAllowed) {
      return (
        <div
          className="policy-note"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: "16px 0",
            color: "#15803d",
          }}
        >
          <span style={{ fontSize: "16px", fontWeight: "bold" }}>✓</span>
          <strong>Your photos look good.</strong>
        </div>
      );
    }
    if (isRejected) {
      const reason = scan.reason || "These photos can't be listed.";
      return (
        <div className="policy-note notice error" style={{ margin: "16px 0" }}>
          <p>
            <strong>{reason}</strong>
          </p>
          <button
            type="button"
            className="text-button"
            onClick={onReplacePhotos}
            style={{ marginTop: "4px" }}
          >
            Replace photos
          </button>
        </div>
      );
    }
    // Review verdict
    const hasSpecificReason =
      scan.reason &&
      scan.reason !== "We're not sure what this piece is.";
    return (
      <div className="policy-note" style={{ margin: "16px 0" }}>
        <strong>Someone at Dzirent will check these photos.</strong>
        {hasSpecificReason && (
          <p style={{ fontSize: "12px", margin: "4px 0 0" }}>{scan.reason}</p>
        )}
      </div>
    );
  }
  return null;
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
  const [textErrors, setTextErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [signed, setSigned] = useState(initialSigned);
  const [signing, setSigning] = useState(false);
  const [ticks, setTicks] = useState(declarationTexts.map(() => false));
  const [legalName, setLegalName] = useState("");
  const [pendingDraft, setPendingDraft] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");

  // Scan & suggestions state
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<
    "none" | "uploading" | "checking" | "finished" | "failed"
  >("none");
  const [latestScan, setLatestScan] = useState<ListingScan | null>(null);
  const [photoWarnings, setPhotoWarnings] = useState<Record<string, string[]>>({});
  const [suggestedFields, setSuggestedFields] = useState<Record<string, boolean>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  const finished = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const targetSlot = useRef("front");
  const key = "listing:" + me + ":" + (listing?.id || "new");

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

  // Watch listing_scans with Realtime and polling fallback
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const client = browserClient();

    async function loadPhotoWarnings(sId: string) {
      try {
        const { data: pScans } = await client
          .from("photo_scans")
          .select("photo_id,slot,warnings,decision")
          .eq("scan_id", sId);
        if (pScans && !cancelled) {
          const map: Record<string, string[]> = {};
          for (const ps of pScans) {
            if (ps.warnings && ps.warnings.length) {
              if (ps.photo_id) map[ps.photo_id] = ps.warnings;
              if (ps.slot) map[ps.slot] = ps.warnings;
            }
          }
          setPhotoWarnings(map);
        }
      } catch {}
    }

    function applySuggestions(s: ScanSuggestions | null | undefined) {
      if (!s || typeof s !== "object") return;
      setForm((prev) => {
        const next = { ...prev };
        const newlySuggested: Record<string, boolean> = {};

        const currentTitle = prev.title.trim();
        if (
          (!currentTitle || currentTitle === "New listing (draft)") &&
          !touchedFields.title &&
          s.title
        ) {
          next.title = String(s.title).slice(0, 80);
          newlySuggested.title = true;
        }

        const currentCat = prev.category.trim();
        if (
          (!currentCat || currentCat === "Everyday") &&
          !touchedFields.category &&
          s.category &&
          categories.includes(s.category)
        ) {
          next.category = s.category;
          newlySuggested.category = true;
          if (s.category === "Accessories") {
            if (!prev.item_type && !touchedFields.item_type && s.item_type) {
              next.item_type = s.item_type;
              newlySuggested.item_type = true;
            }
          }
        }

        if (
          (!prev.garment_type || prev.garment_type === "top") &&
          !touchedFields.garment_type &&
          s.garment_type
        ) {
          next.garment_type = s.garment_type;
          newlySuggested.garment_type = true;
          setRows(measurementRows(s.garment_type, next.item_type || ""));
        }

        if (
          !prev.description.trim() &&
          !touchedFields.description &&
          s.description
        ) {
          next.description = String(s.description).slice(0, 1000);
          newlySuggested.description = true;
        }

        if (
          (!prev.listing_styles || !prev.listing_styles.length) &&
          !touchedFields.listing_styles &&
          Array.isArray(s.styles) &&
          s.styles.length
        ) {
          const validStyles = s.styles
            .filter((st: string) => styles.includes(st))
            .slice(0, 3);
          if (validStyles.length) {
            next.listing_styles = validStyles;
            newlySuggested.listing_styles = true;
          }
        }

        setSuggestedFields((old) => ({ ...old, ...newlySuggested }));
        return next;
      });
    }

    function handleScan(scan: Partial<ListingScan> | null | undefined) {
      if (!scan || !scan.id || !scan.status || cancelled) return;
      const validScan = scan as ListingScan;
      setLatestScan(validScan);
      if (validScan.status === "queued" || validScan.status === "running") {
        setScanPhase("checking");
      } else if (validScan.status === "failed") {
        setScanPhase("failed");
      } else if (validScan.status === "done") {
        setScanPhase("finished");
        void loadPhotoWarnings(validScan.id);
        const isAllowed =
          validScan.admin_decision === "approved" ||
          (!validScan.admin_decision && validScan.verdict === "allowed");
        if (isAllowed && validScan.suggestions) {
          applySuggestions(validScan.suggestions);
        }
      }
    }

    const channel = client
      .channel("listing-scan-" + id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "listing_scans",
          filter: "listing_id=eq." + id,
        },
        (payload) => {
          handleScan(payload.new);
        },
      )
      .subscribe();

    let pollInterval: NodeJS.Timeout | null = null;
    let elapsedMs = 0;

    async function poll() {
      try {
        const { data: rows } = await client
          .from("listing_scans")
          .select("*")
          .eq("listing_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (rows && rows.length && !cancelled) {
          const scan = rows[0];
          handleScan(scan);
          if (scan.status === "done" || scan.status === "failed") {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } catch {}
    }

    void poll();

    pollInterval = setInterval(() => {
      elapsedMs += 3000;
      if (elapsedMs > 180000) {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = null;
        setScanPhase((prev) => (prev === "checking" ? "failed" : prev));
        return;
      }
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      void client.removeChannel(channel);
    };
  }, [id, scanId, touchedFields]);

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

  // Upload all pending photos and remove deleted ones
  async function syncPhotos(targetId: string, currentPhotos: EditorPhoto[], deleted: string[]) {
    for (const photoId of deleted) {
      await workflow("photo/" + targetId + "/delete", { id: photoId });
    }
    setRemoved([]);

    const nextPhotos = [...currentPhotos];
    for (let i = 0; i < nextPhotos.length; i++) {
      const p = nextPhotos[i];
      if (p.id) continue;
      if (!p.blob) continue;
      const body = new FormData();
      body.set("photo", p.blob, "photo.jpg");
      body.set("slot", p.slot);
      body.set("token", p.token);
      const response = await fetch("/api/workflows/photo/" + targetId + "/upload", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not upload this photo.");
      const saved = result as OwnPhoto;
      nextPhotos[i] = {
        ...p,
        id: saved.id,
        storage_path: saved.storage_path,
      };
    }
    setPhotos(nextPhotos);
    return nextPhotos;
  }

  // Step 1 -> Step 2
  async function advanceToDetails() {
    if (!photos.length) {
      setError("Add at least one photo before continuing.");
      return;
    }
    setBusy(true);
    setError("");
    setPhase("Preparing your listing");
    try {
      // 1. If draft row doesn't exist yet on server, save paused draft
      if (!created) {
        await workflow("listings/save", {
          id,
          form: {
            ...form,
            title: form.title.trim() || "New listing (draft)",
            category: form.category || "Everyday",
            status: "paused",
          },
        });
        setCreated(true);
      }

      // 2. Upload pending photos and delete removed ones
      setPhase("Uploading photos");
      await syncPhotos(id, photos, removed);

      // 3. Request scan
      setPhase("Checking photos");
      setScanPhase("checking");
      const scanResult = await workflow<{ scan_id: string }>("listings/scan", {
        id,
      });
      setScanId(scanResult.scan_id);

      // 4. Advance immediately to Step 2!
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  // Step 2 -> Step 3
  async function advanceToStep3() {
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
    if (form.category === "Accessories" && !signed) {
      setSigning(true);
      return;
    }
    setBusy(true);
    setError("");
    setTextErrors({});
    try {
      // Save details to server (which also checks text-safety triggers)
      await workflow("listings/save", { id, form });
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const err = e instanceof WorkflowClientError ? e : (e as Error);
      if (
        e instanceof WorkflowClientError &&
        e.field &&
        ["title", "description"].includes(e.field)
      ) {
        setTextErrors({ [e.field]: e.message });
      } else {
        setError(err.message || "Could not save details.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    setBusy(true);
    setError("");
    try {
      setScanPhase("checking");
      const res = await workflow<{ scan_id: string }>("listings/scan", { id });
      setScanId(res.scan_id);
    } catch (e) {
      setError((e as Error).message);
      setScanPhase("failed");
    } finally {
      setBusy(false);
    }
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
    setTextErrors({});
    try {
      setPhase("Saving listing details");
      await workflow("listings/save", { id, form: nextForm });
      setCreated(true);

      setPhase("Syncing photos");
      const currentPhotos = await syncPhotos(id, photos, removed);

      setPhase("Saving size, price and dates");
      await workflow("listings/finish", {
        id,
        form: nextForm,
        photos: currentPhotos.map((p) => ({ id: p.id, slot: p.slot })),
        status: originalStatus,
      });

      finished.current = true;
      await draftClear(key).catch(() => {});
      router.push("/app/closet");
      router.refresh();
    } catch (e) {
      const err = e instanceof WorkflowClientError ? e : (e as Error);
      if (e instanceof WorkflowClientError && e.field) {
        if (["title", "description"].includes(e.field)) {
          setTextErrors({ [e.field]: e.message });
          setStep(2);
        } else if (["price_note", "deposit_note"].includes(e.field)) {
          setTextErrors({ [e.field]: e.message });
          setStep(3);
        } else {
          setError(err.message);
        }
      } else {
        setError(err.message);
      }
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
      const deleteId = pendingDraft?.id || (created && !listing ? id : null);
      if (deleteId && !listing) {
        await workflow("listings/" + deleteId + "/delete", {}).catch(() => {});
      }
      await draftClear(key);
      setPendingDraft(null);
      setReady(true);
      setForm(initialForm(null));
      setPhotos([]);
      setRows(measurementRows("top", ""));
      setId(crypto.randomUUID());
      setCreated(false);
      setScanId(null);
      setScanPhase("none");
      setLatestScan(null);
      setPhotoWarnings({});
      setSuggestedFields({});
      setTouchedFields({});
      setStep(1);
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
      <div className="editor-progress" aria-label={"Step " + step + " of 3"}>
        {["Photos", "Details", "Size, price and dates"].map((title, i) => (
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
            void advanceToDetails();
          } else if (step === 2) {
            void advanceToStep3();
          } else {
            void publish();
          }
        }}
      >
        <fieldset disabled={busy || !ready} className="workflow-fieldset">
          {step === 1 && (
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
                {photos.map((p, i) => {
                  const warnings =
                    (p.id && photoWarnings[p.id]) ||
                    photoWarnings[p.slot] ||
                    [];
                  return (
                    <article className="editor-photo" key={p.token}>
                      <div className="editor-photo-image">
                        <EditorPhotoPreview photo={p} />
                        <span>{slotNames[slots.indexOf(p.slot)]}</span>
                      </div>
                      {warnings.length > 0 && (
                        <div style={{ padding: "4px 8px" }}>
                          {warnings.map((w, idx) => (
                            <p
                              key={idx}
                              style={{
                                color: "#d97706",
                                fontSize: "11px",
                                lineHeight: "1.3",
                                margin: "2px 0",
                              }}
                            >
                              ⚠️ {w}
                            </p>
                          ))}
                        </div>
                      )}
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
                  );
                })}
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
          )}

          {step === 2 && (
            <>
              <PhotoCheckBanner
                phase={scanPhase}
                scan={latestScan}
                onRetry={() => void checkAgain()}
                onReplacePhotos={() => setStep(1)}
              />
              {Object.values(suggestedFields).some(Boolean) && (
                <div
                  className="policy-note"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span>
                    Filled from your photos. Tap ✕ on any field if anything&apos;s
                    off.
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSuggestedFields({})}
                  >
                    Accept all
                  </button>
                </div>
              )}
              <section className="editor-section">
                <h2>Details</h2>
                <label className="field">
                  <span>Title</span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      value={form.title}
                      maxLength={80}
                      placeholder="e.g. Navy linen blazer"
                      onChange={(e) => {
                        change({ title: e.target.value });
                        setTouchedFields((prev) => ({ ...prev, title: true }));
                        if (textErrors.title)
                          setTextErrors((prev) => ({ ...prev, title: "" }));
                      }}
                    />
                    {form.title && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Clear title"
                        onClick={() => {
                          change({ title: "" });
                          setSuggestedFields((prev) => ({
                            ...prev,
                            title: false,
                          }));
                          setTouchedFields((prev) => ({
                            ...prev,
                            title: true,
                          }));
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                  <small>{form.title.length}/80</small>
                  {textErrors.title && (
                    <p
                      role="alert"
                      className="form-message error"
                      style={{
                        margin: "4px 0 0",
                        fontSize: "13px",
                        color: "var(--danger, #d32f2f)",
                      }}
                    >
                      {textErrors.title}
                    </p>
                  )}
                </label>
                <label className="field">
                  <span>Category</span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <select
                      value={form.category}
                      onChange={(e) => {
                        change({ category: e.target.value });
                        setTouchedFields((prev) => ({
                          ...prev,
                          category: true,
                        }));
                      }}
                    >
                      <option value="">Choose a category</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    {form.category && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Clear category"
                        onClick={() => {
                          change({ category: "" });
                          setSuggestedFields((prev) => ({
                            ...prev,
                            category: false,
                          }));
                          setTouchedFields((prev) => ({
                            ...prev,
                            category: true,
                          }));
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                </label>
                {form.category === "Accessories" && (
                  <>
                    <label className="field">
                      <span>Item type</span>
                      <select
                        value={form.item_type}
                        onChange={(e) => {
                          change({ item_type: e.target.value });
                          setTouchedFields((prev) => ({
                            ...prev,
                            item_type: true,
                          }));
                        }}
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
                  <div style={{ position: "relative" }}>
                    <textarea
                      maxLength={1000}
                      rows={4}
                      value={form.description}
                      onChange={(e) => {
                        change({ description: e.target.value });
                        setTouchedFields((prev) => ({
                          ...prev,
                          description: true,
                        }));
                        if (textErrors.description)
                          setTextErrors((prev) => ({
                            ...prev,
                            description: "",
                          }));
                      }}
                    />
                    {form.description && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Clear description"
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                        }}
                        onClick={() => {
                          change({ description: "" });
                          setSuggestedFields((prev) => ({
                            ...prev,
                            description: false,
                          }));
                          setTouchedFields((prev) => ({
                            ...prev,
                            description: true,
                          }));
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                  <small>{form.description.length}/1000</small>
                  {textErrors.description && (
                    <p
                      role="alert"
                      className="form-message error"
                      style={{
                        margin: "4px 0 0",
                        fontSize: "13px",
                        color: "var(--danger, #d32f2f)",
                      }}
                    >
                      {textErrors.description}
                    </p>
                  )}
                </label>
                <div className="section-title" style={{ marginTop: "16px" }}>
                  <h3>
                    Styles <small className="muted">(up to 3)</small>
                  </h3>
                  {form.listing_styles.length > 0 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        change({ listing_styles: [] });
                        setSuggestedFields((prev) => ({
                          ...prev,
                          listing_styles: false,
                        }));
                        setTouchedFields((prev) => ({
                          ...prev,
                          listing_styles: true,
                        }));
                      }}
                    >
                      Clear styles
                    </button>
                  )}
                </div>
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
                      onClick={() => {
                        change({
                          listing_styles: form.listing_styles.includes(s)
                            ? form.listing_styles.filter((t) => t !== s)
                            : [...form.listing_styles, s],
                        });
                        setTouchedFields((prev) => ({
                          ...prev,
                          listing_styles: true,
                        }));
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {step === 3 && (
            <>
              <PhotoCheckBanner
                phase={scanPhase}
                scan={latestScan}
                onRetry={() => void checkAgain()}
                onReplacePhotos={() => setStep(1)}
              />
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
                <details
                  className="more-options"
                  open={Boolean(
                    textErrors.price_note ||
                      textErrors.deposit_note ||
                      form.price_note ||
                      form.retail_value ||
                      form.deposit_note,
                  )}
                >
                  <summary>More options</summary>
                  <label className="field">
                    <span>Price details (optional)</span>
                    <input
                      value={form.price_note}
                      maxLength={60}
                      placeholder="e.g. Dry cleaning included"
                      onChange={(e) => {
                        change({ price_note: e.target.value });
                        if (textErrors.price_note)
                          setTextErrors((prev) => ({
                            ...prev,
                            price_note: "",
                          }));
                      }}
                    />
                    {textErrors.price_note && (
                      <p
                        role="alert"
                        className="form-message error"
                        style={{
                          margin: "4px 0 0",
                          fontSize: "13px",
                          color: "var(--danger, #d32f2f)",
                        }}
                      >
                        {textErrors.price_note}
                      </p>
                    )}
                  </label>
                  <label className="field">
                    <span>Retail value (USD, optional)</span>
                    <input
                      inputMode="numeric"
                      value={form.retail_value}
                      onChange={(e) => change({ retail_value: e.target.value })}
                    />
                  </label>
                  {Number(form.retail_value) >= 150 && (
                    <p className="policy-note">
                      This is a valuable piece. Consider asking renters for a
                      refundable deposit.
                    </p>
                  )}
                  <label className="field">
                    <span>Deposit note (optional)</span>
                    <input
                      value={form.deposit_note}
                      maxLength={120}
                      placeholder="e.g. $40 refundable deposit, cash at pickup"
                      onChange={(e) => {
                        change({ deposit_note: e.target.value });
                        if (textErrors.deposit_note)
                          setTextErrors((prev) => ({
                            ...prev,
                            deposit_note: "",
                          }));
                      }}
                    />
                    {textErrors.deposit_note && (
                      <p
                        role="alert"
                        className="form-message error"
                        style={{
                          margin: "4px 0 0",
                          fontSize: "13px",
                          color: "var(--danger, #d32f2f)",
                        }}
                      >
                        {textErrors.deposit_note}
                      </p>
                    )}
                  </label>
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
              {step > 1 && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setStep((s) => s - 1);
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
                    ? "Next: Details"
                    : step === 2
                      ? "Next: Size & price"
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
