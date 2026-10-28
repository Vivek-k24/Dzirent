"use client";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Camera, Check, ImagePlus, Plus, Trash2, Upload, X } from "lucide-react";
import { dateOnly, minorUnits } from "@dzirent/client";
import type { ProductDetail, ProductWrite, References } from "@dzirent/client";
import { productWriteSchema } from "@/lib/listing-schema";
import { photoIssue, sanitizePreviewUrl, uploadPhoto } from "@/lib/photo-upload";
import media from "@/mocks/media.json";
import { Button, Modal } from "./ui/primitives";
import { useRuntime } from "./providers";

const amount = z.string().refine(value => minorUnits(value) !== null, "Enter a nonnegative dollar amount with at most two decimals.");
const formSchema = z.object({
  title: z.string().trim().min(1, "Enter an outfit title.").max(160), description: z.string().trim().min(1, "Describe this outfit.").max(5000),
  primary_category_id: z.uuid("Choose a subcategory."), brand_id: z.uuid("Choose a brand."), size_id: z.uuid("Choose the one listed size."),
  color_ids: z.array(z.string()).min(1, "Choose at least one color."), metro_id: z.uuid("Listing location is unavailable."),
  secondary_category_ids: z.array(z.string()), band: z.enum(["A", "B", "C", "D"]), rental: amount, retail: amount,
  garment_type: z.string().trim().min(1, "Enter a garment type."), audience: z.enum(["women", "men", "unisex"]),
  fabric: z.string().trim().min(1, "Enter a fabric."), occasion: z.string().trim().min(1, "Enter an occasion."),
  stretch: z.string(), alterations: z.string(), known_wear: z.string(),
  chest: z.string().refine(v => v === "" || (Number.isFinite(Number(v)) && Number(v) > 0), "Enter a positive cm measurement."),
  length: z.string().refine(v => v === "" || (Number.isFinite(Number(v)) && Number(v) > 0), "Enter a positive cm measurement."),
  is_available: z.boolean(), image_id: z.uuid("Choose a demo photo."),
});
type Values = z.infer<typeof formSchema>;

function LocalPhotoPreview({ url }: { url: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const safe = sanitizePreviewUrl(url);
    if (!safe) {
      el.removeAttribute("src");
      return;
    }
    // codeql[js/dom-text-reinterpreted-as-html]
    el.src = safe;
  }, [url]);
  return <img ref={ref} width={900} height={1200} alt="Selected photo preview" />;
}

export function ListingForm({ product, refs, pending, close, save, onProductUpdated }: {
  product?: ProductDetail; refs: References; pending: boolean; close: () => void; save: (data: ProductWrite) => Promise<void>;
  onProductUpdated?: (updated: ProductDetail) => void;
}) {
  const runtime = useRuntime(), [error, setError] = useState(""), [root, setRoot] = useState(product?.primary_collection_id ?? refs.categories[0].id);
  const [activeProduct, setActiveProduct] = useState<ProductDetail | undefined>(product);
  const [attachedImages, setAttachedImages] = useState<ProductDetail["images"]>(product?.images ?? []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileFeedback, setFileFeedback] = useState<{ error?: string; info?: string } | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [altText, setAltText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [status, setStatus] = useState<"draft" | "published">(product?.status === "published" ? "published" : "draft");
  const [blocks, setBlocks] = useState<ProductDetail["date_blocks"]>(product?.date_blocks ?? []);
  const [blockStart, setBlockStart] = useState(""), [blockEnd, setBlockEnd] = useState(""), [blockError, setBlockError] = useState("");
  const [photos, setPhotos] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: {
    title: product?.title ?? "", description: product?.description ?? "", primary_category_id: product?.primary_category_id ?? "",
    brand_id: product?.brand.id ?? "", size_id: product?.size.id ?? "", color_ids: product?.colors.map(c => c.id) ?? [],
    metro_id: product?.metro.id ?? refs.locations.items[0].id, secondary_category_ids: product?.secondary_category_ids ?? [],
    band: product?.band ?? "A", rental: product ? (product.rental_price_minor / 100).toFixed(2) : "", retail: product ? (product.retail_price_minor / 100).toFixed(2) : "",
    garment_type: product?.garment_type ?? "", audience: product?.audience ?? "women", fabric: product?.fabric ?? "", occasion: product?.occasion ?? "",
    stretch: product?.stretch ?? "", alterations: product?.alterations ?? "", known_wear: product?.known_wear ?? "",
    chest: String(product?.measurements.find(m => m.key === "chest")?.value ?? ""), length: String(product?.measurements.find(m => m.key === "length")?.value ?? ""),
    is_available: product?.is_available ?? true, image_id: product?.image.id ?? media[0].image_id,
  } });
  const selectedImage = useWatch({ control: form.control, name: "image_id" }), photo = media.find(m => m.image_id === selectedImage);
  const fieldError = (name: keyof Values) => form.formState.errors[name]?.message;
  const busy = pending || form.formState.isSubmitting;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const issue = photoIssue(file);
    if (issue) {
      setFileFeedback({ error: issue });
      setSelectedFile(null);
      setLocalPreviewUrl(null);
    } else {
      setSelectedFile(file);
      setLocalPreviewUrl(URL.createObjectURL(file));
      const sizeMb = (file.size / 1_000_000).toFixed(2);
      setFileFeedback({ info: `${file.name} (${sizeMb} MB) · Ready to upload` });
      setUploadError("");
      setUploadSuccess("");
    }
  };

  const handleUpload = async () => {
    if (!activeProduct || !selectedFile) return;
    if (!rightsConfirmed) {
      setUploadError("Confirm your photo rights and consent before uploading.");
      return;
    }
    setUploading(true);
    setUploadError("");
    setUploadSuccess("");
    try {
      const updated = await uploadPhoto(
        activeProduct,
        selectedFile,
        altText.trim() || activeProduct.title || "Garment photo",
        rightsConfirmed
      );
      setActiveProduct(updated);
      setAttachedImages(updated.images);
      form.setValue("image_id", updated.image.id, { shouldDirty: false });
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
      }
      setSelectedFile(null);
      setFileFeedback(null);
      setRightsConfirmed(false);
      setAltText("");
      setUploadSuccess("Photograph attached to this draft listing.");
      onProductUpdated?.(updated);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please retry.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (imageId: string) => {
    const remaining = attachedImages.filter(img => img.id !== imageId);
    setAttachedImages(remaining);
    if (remaining.length) {
      form.setValue("image_id", remaining[0].id, { shouldDirty: true });
    } else {
      form.setValue("image_id", media[0].image_id, { shouldDirty: true });
    }
    setUploadSuccess("Photograph removed. Save draft to persist changes.");
  };

  return <form className="listing-form" noValidate onSubmit={form.handleSubmit(async values => {
    setError("");
    const measurements = (product?.measurements ?? []).filter(m => !["chest", "length"].includes(m.key));
    if (values.chest) measurements.push({ key: "chest", value: Number(values.chest), unit: "cm" });
    if (values.length) measurements.push({ key: "length", value: Number(values.length), unit: "cm" });
    const imageIds = attachedImages.length > 0 ? attachedImages.map(img => img.id) : [values.image_id];
    const candidate = productWriteSchema(refs).safeParse({
      title: values.title, description: values.description, primary_category_id: values.primary_category_id, secondary_category_ids: values.secondary_category_ids,
      brand_id: values.brand_id, size_id: values.size_id, color_ids: values.color_ids, metro_id: values.metro_id, band: values.band,
      rental_price_minor: minorUnits(values.rental), retail_price_minor: minorUnits(values.retail), currency: "USD", garment_type: values.garment_type,
      audience: values.audience, fabric: values.fabric, occasion: values.occasion, stretch: values.stretch, alterations: values.alterations,
      known_wear: values.known_wear, measurements, date_blocks: blocks, image_ids: imageIds, status, is_available: values.is_available,
    });
    if (!candidate.success) { setError(candidate.error.issues.map(x => x.message).join(" ")); return; }
    try { await save(candidate.data); } catch (error) { setError(error instanceof Error ? error.message : "Your listing could not be saved."); }
  }, () => setError("Please review the highlighted fields before saving."))}>
    <p className="info-note">{runtime.demo ? "MOCK LISTING · Changes stay in this page session. Choose licensed fixture photography; uploads are not connected." : "Connected listing · Media uploads require the approved provider integration."} One listing represents one physical garment.</p>
    <div className="listing-form-layout"><div className="listing-fields">
      <section className="form-section"><h3>Tell its story</h3>
        <label htmlFor="listing-title">Outfit title<input id="listing-title" {...form.register("title")} aria-invalid={!!fieldError("title")} aria-describedby="title-error" placeholder="A little something for the occasion" /></label><p id="title-error" className="field-error">{fieldError("title")}</p>
        <label htmlFor="listing-description">Description<textarea id="listing-description" rows={4} {...form.register("description")} aria-invalid={!!fieldError("description")} /></label><p className="field-error">{fieldError("description")}</p>
        <div className="form-grid"><label htmlFor="listing-root">Collection<select id="listing-root" value={root} onChange={event => { setRoot(event.target.value); form.setValue("primary_category_id", ""); }}>{refs.categories.map(c => <option value={c.id} key={c.id}>{c.label}</option>)}</select></label>
          <label htmlFor="listing-category">Subcategory<select id="listing-category" {...form.register("primary_category_id")} aria-invalid={!!fieldError("primary_category_id")}><option value="">Choose a subcategory</option>{refs.categories.find(c => c.id === root)?.children?.map(c => <option value={c.id} key={c.id}>{c.label}</option>)}</select><span className="field-error">{fieldError("primary_category_id")}</span></label>
          <label htmlFor="listing-brand">Brand<select id="listing-brand" {...form.register("brand_id")} aria-invalid={!!fieldError("brand_id")}><option value="">Choose a brand</option>{refs.facets.brands.map(c => <option value={c.id} key={c.id}>{c.label}</option>)}</select><span className="field-error">{fieldError("brand_id")}</span></label>
          <label htmlFor="listing-type">Garment type<input id="listing-type" {...form.register("garment_type")} aria-invalid={!!fieldError("garment_type")} placeholder="e.g. midi dress" /><span className="field-error">{fieldError("garment_type")}</span></label>
        </div><fieldset><legend>Also appears in <span className="muted tiny">· optional collections</span></legend><div className="form-check-grid">{refs.categories.filter(c => c.id !== root).map(c => <label className="choice" key={c.id}><input type="checkbox" value={c.id} {...form.register("secondary_category_ids")} />{c.label}</label>)}</div></fieldset>
      </section>
      <section className="form-section"><h3>Fit & details</h3><div className="form-grid">
        <label htmlFor="listing-size">Listed size<select id="listing-size" {...form.register("size_id")} aria-invalid={!!fieldError("size_id")}><option value="">Choose one size</option>{refs.facets.sizes.map(s => <option value={s.id} key={s.id}>{s.sizing_system} · {s.label}</option>)}</select><span className="field-error">{fieldError("size_id")}</span></label>
        <label htmlFor="listing-audience">Audience<select id="listing-audience" {...form.register("audience")}><option value="women">Women</option><option value="men">Men</option><option value="unisex">Unisex</option></select></label>
        <label htmlFor="listing-chest">Chest (cm, optional)<input id="listing-chest" inputMode="decimal" {...form.register("chest")} aria-invalid={!!fieldError("chest")} /><span className="field-error">{fieldError("chest")}</span></label>
        <label htmlFor="listing-length">Length (cm, optional)<input id="listing-length" inputMode="decimal" {...form.register("length")} aria-invalid={!!fieldError("length")} /><span className="field-error">{fieldError("length")}</span></label>
        <label htmlFor="listing-fabric">Fabric<input id="listing-fabric" {...form.register("fabric")} list="fabric-options" aria-invalid={!!fieldError("fabric")} /><span className="field-error">{fieldError("fabric")}</span></label>
        <label htmlFor="listing-occasion">Occasion<input id="listing-occasion" {...form.register("occasion")} list="occasion-options" aria-invalid={!!fieldError("occasion")} /><span className="field-error">{fieldError("occasion")}</span></label>
      </div><datalist id="fabric-options">{refs.facets.fabrics.map(x => <option value={x} key={x} />)}</datalist><datalist id="occasion-options">{refs.facets.occasions.map(x => <option value={x} key={x} />)}</datalist>
        <fieldset><legend>Colors</legend><div className="form-check-grid">{refs.facets.colors.map(c => <label className="choice" key={c.id}><input type="checkbox" value={c.id} {...form.register("color_ids")} /><span className="color-swatch" style={{ background: c.swatch_hex }} aria-hidden="true" />{c.label}</label>)}</div><p className="field-error">{fieldError("color_ids")}</p></fieldset>
        <div className="form-grid"><label htmlFor="listing-stretch">Stretch<input id="listing-stretch" {...form.register("stretch")} placeholder="e.g. non-stretch" /></label><label htmlFor="listing-alterations">Alterations<input id="listing-alterations" {...form.register("alterations")} placeholder="Describe any alterations" /></label></div>
        <label htmlFor="listing-wear">Known wear<textarea id="listing-wear" rows={2} {...form.register("known_wear")} placeholder="Describe condition honestly" /></label>
      </section>
      <section className="form-section"><h3>Sample rental amounts</h3><p className="tiny muted">Display amounts only. No payout, tax calculation or payment is created.</p><input type="hidden" {...form.register("metro_id")} /><div className="form-grid">
        <label htmlFor="listing-band">Sample price band<select id="listing-band" {...form.register("band")}><option value="A">A · under $50</option><option value="B">B · $50–$99.99</option><option value="C">C · $100–$149.99</option><option value="D">D · $150+</option></select></label>
        <label htmlFor="listing-rental">Four-day sample rental ($)<input id="listing-rental" inputMode="decimal" {...form.register("rental")} aria-invalid={!!fieldError("rental")} /><span className="field-error">{fieldError("rental")}</span></label>
        <label htmlFor="listing-retail">Sample retail ($)<input id="listing-retail" inputMode="decimal" {...form.register("retail")} aria-invalid={!!fieldError("retail")} /><span className="field-error">{fieldError("retail")}</span></label>
      </div><p className="tiny muted">Only in Texas. Delivery estimate unavailable in this demo.</p></section>
      <section className="form-section"><h3>Availability</h3><label className="choice"><input type="checkbox" {...form.register("is_available")} />Available for demo date selection</label>
        <p className="tiny muted">Date blocks include both endpoints. They affect the availability filter and bag validation.</p>
        <div className="form-grid block-inputs"><label htmlFor="block-start">Unavailable from<input id="block-start" type="date" value={blockStart} onChange={event => setBlockStart(event.target.value)} /></label><label htmlFor="block-end">Unavailable through<input id="block-end" type="date" value={blockEnd} onChange={event => setBlockEnd(event.target.value)} /></label></div>
        <Button variant="outline" onClick={() => { if (!dateOnly(blockStart) || !dateOnly(blockEnd) || blockEnd < blockStart) { setBlockError("Choose complete, ordered unavailable dates."); return; } setBlocks(b => [...b, { start: blockStart, end: blockEnd, reason: "owner-unavailable" }]); setBlockStart(""); setBlockEnd(""); setBlockError(""); }}><Plus size={15} />Add date block</Button>{blockError ? <p className="field-error" role="alert">{blockError}</p> : null}
        <ul className="date-blocks">{blocks.map((block, i) => <li key={`${block.start}-${block.end}-${i}`}><span>{block.start} – {block.end}</span><button type="button" className="icon-button" aria-label={`Remove date block ${block.start} through ${block.end}`} onClick={() => setBlocks(b => b.filter((_, index) => index !== i))}><X size={16} /></button></li>)}</ul>
      </section>
    </div><aside className="listing-photo-column">
      <div className="listing-photo-preview">
        {localPreviewUrl ? (
          <LocalPhotoPreview url={localPreviewUrl} />
        ) : attachedImages.length > 0 ? (
          <img src={attachedImages[0].url} width={900} height={1200} alt={attachedImages[0].alt_text || "Attached garment photograph"} />
        ) : photo ? (
          <img src={photo.url} width={900} height={1200} alt="Selected illustrative demo fashion photograph" />
        ) : (
          <ImagePlus size={32} />
        )}
      </div>

      <div className="photo-actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {activeProduct ? (
          <>
            <div className="photo-guidelines" style={{ fontSize: 10, lineHeight: 1.4, color: "var(--color-muted, #666)", padding: "6px 8px", background: "var(--color-subtle, #f5f5f5)", borderRadius: 4 }}>
              <strong>Photo guidelines:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 14 }}>
                <li>JPEG, PNG or WebP · Max 4 MB</li>
                <li>Flat-lay, hanger or model in clear lighting</li>
                <li>Private metadata stripped automatically</li>
              </ul>
            </div>

            <input
              type="file"
              id="garment-photo-input"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <label
              htmlFor="garment-photo-input"
              className="button button-outline"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontSize: 11, padding: "6px 10px" }}
            >
              <Camera size={14} />
              {selectedFile ? "Change selected photo" : "Select or capture photo"}
            </label>

            {fileFeedback?.info ? (
              <p className="tiny" style={{ color: "#166534", margin: 0, fontSize: 10 }}>{fileFeedback.info}</p>
            ) : null}
            {fileFeedback?.error ? (
              <p className="field-error" style={{ margin: 0, fontSize: 10 }}>{fileFeedback.error}</p>
            ) : null}

            {selectedFile && !fileFeedback?.error ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px", border: "1px solid var(--color-border-soft, #e5e5e5)", borderRadius: 4 }}>
                <label htmlFor="photo-alt-input" style={{ fontSize: 10, color: "#555" }}>
                  Photo description
                  <input
                    id="photo-alt-input"
                    type="text"
                    value={altText}
                    onChange={e => setAltText(e.target.value)}
                    placeholder="e.g. Navy evening gown on hanger"
                    style={{ width: "100%", padding: "4px 6px", fontSize: 11, marginTop: 2, boxSizing: "border-box" }}
                  />
                </label>
                <label className="choice" style={{ fontSize: 10, display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    id="photo-rights-checkbox"
                    checked={rightsConfirmed}
                    onChange={e => setRightsConfirmed(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>I confirm I own this photo and have consent from any person shown.</span>
                </label>
                <Button
                  variant="primary"
                  disabled={uploading || !rightsConfirmed}
                  onClick={handleUpload}
                  style={{ width: "100%", fontSize: 11, padding: "6px 10px" }}
                >
                  <Upload size={14} />
                  {uploading ? "Uploading photo…" : "Upload photo"}
                </Button>
              </div>
            ) : null}

            {attachedImages.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                <span className="tiny muted" style={{ fontSize: 10 }}>Photo attached</span>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => handleRemovePhoto(attachedImages[0].id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 6px", color: "#b91c1c" }}
                  aria-label="Remove attached photo"
                >
                  <Trash2 size={12} />
                  Remove photo
                </button>
              </div>
            ) : null}

            {uploadSuccess ? (
              <p className="tiny" style={{ color: "#166534", margin: "2px 0", fontSize: 10 }} role="status">{uploadSuccess}</p>
            ) : null}
            {uploadError ? (
              <div style={{ margin: "2px 0" }}>
                <p className="field-error" style={{ margin: "0 0 4px", fontSize: 10 }} role="alert">{uploadError}</p>
                <Button variant="outline" onClick={handleUpload} style={{ width: "100%", fontSize: 10, padding: "4px 8px" }}>
                  Retry upload
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: 10, color: "var(--color-muted, #666)", padding: "6px 8px", background: "var(--color-subtle, #f5f5f5)", borderRadius: 4 }}>
            <p style={{ margin: 0 }}>Save this draft listing first to upload custom photos.</p>
          </div>
        )}

        <Button id="choose-fixture-photo" variant="outline" onClick={() => setPhotos(true)} style={{ fontSize: 10, padding: "5px 8px" }}>
          <ImagePlus size={14} />
          {attachedImages.length > 0 ? "Or choose fixture photo" : "Choose fixture photo"}
        </Button>
        <p className="tiny muted" style={{ margin: 0, fontSize: 10 }}>Licensed illustrative photography is available for Texas boutique demo simulation.</p>
      </div>
    </aside></div>
    {error ? <p className="field-error form-error" role="alert">{error}</p> : null}
    <div className="listing-form-footer"><Button variant="quiet" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="outline" disabled={busy} onClick={() => setStatus("draft")}>{busy && status === "draft" ? "Saving…" : "Save draft"}</Button><Button type="submit" disabled={busy} onClick={() => setStatus("published")}>{busy && status === "published" ? "Saving…" : product ? "Save & publish" : "Publish mock listing"}<ArrowRight size={16} /></Button></div>
    <Modal open={photos} onOpenChange={setPhotos} title="Choose a fixture photo" description="Forty licensed illustrative fashion photographs. No upload or external image URL is needed." restoreId="choose-fixture-photo">
      <div className="photo-picker">{media.map((m, i) => <button key={m.image_id} type="button" aria-label={`Use demo photo ${i + 1}`} aria-pressed={selectedImage === m.image_id} onClick={() => { form.setValue("image_id", m.image_id, { shouldDirty: true }); setPhotos(false); }}><img src={m.url} alt={`Illustrative fashion photo ${i + 1}`} width={90} height={120} loading="lazy" />{selectedImage === m.image_id ? <span><Check size={18} /></span> : null}</button>)}</div>
    </Modal>
  </form>;
}
