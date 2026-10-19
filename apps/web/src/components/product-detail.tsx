"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Heart, MapPin, Ruler, ShoppingBag, Star } from "lucide-react";
import { cartIssue, dateOnly, fourDayEnd, isoDate, money } from "@dzirent/client";
import type { ProductDetail as Product } from "@dzirent/client";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useBag, useSession } from "@/lib/store";
import { useCatalogState } from "@/lib/use-catalog";
import { presentation } from "@/lib/presentation";
import { useReferences, useRuntime } from "./providers";
import { Button, ErrorState, Popover } from "./ui/primitives";
import { GarmentImage } from "./product-card";
import { DatePicker } from "./date-picker";

export function OutfitNotFound() { return <main id="main-content" className="content-width not-found"><span className="eyebrow">A DIFFERENT LOOK AWAITS</span><h1>Outfit not found</h1><p>This outfit may have been archived, or the link may be out of date.</p><Link className="button button-primary" href="/">Explore the collection<ArrowRight size={17} /></Link></main>; }
function firstDate(product: Product): string {
  const day = dateOnly(presentation.start)!;
  for (let i = 0; i < 180; i++) {
    const start = isoDate(day), end = fourDayEnd(start);
    if (!product.date_blocks.some(b => start <= b.end && end >= b.start)) return start;
    day.setDate(day.getDate() + 1);
  }
  return presentation.start;
}
function Details({ product }: { product: Product }) {
  const { state } = useCatalogState(), { refs } = useReferences(), lines = useBag(s => s.lines), saved = useBag(s => s.wishlist.includes(product.id));
  const [start, setStart] = useState(state.start || firstDate(product)), [end, setEnd] = useState(state.end || fourDayEnd(state.start || firstDate(product)));
  const [size, setSize] = useState(""), [photo, setPhoto] = useState(0);
  const images = product.images.length ? product.images : [product.image], image = images[photo] ?? images[0];
  const category = refs?.categories.find(c => c.id === product.primary_collection_id), issue = cartIssue(lines, product, size, start, end);
  return <main id="main-content" className="content-width product-main"><div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={12} />{category ? <><Link href={`/?collection=${category.slug}`}>{category.label}</Link><ChevronRight size={12} /></> : null}<span>{product.title}</span></div>
    <div className="detail-layout"><section className="detail-gallery" aria-label="Outfit photographs"><div className="detail-photo"><GarmentImage key={image.url} image={image} priority sizes="(min-width: 900px) 47vw, 94vw" /></div><div className="detail-thumbnails">{images.map((img, i) => <button key={img.id} className={photo === i ? "selected" : ""} aria-label={`View photo ${i + 1} of ${product.title}`} aria-pressed={photo === i} onClick={() => setPhoto(i)}><GarmentImage image={img} sizes="80px" /></button>)}<p className="tiny muted">{images.length} {images.length === 1 ? "photo supplied" : "photos supplied"}.<br />Illustrative demo photography.</p></div></section>
      <section className="detail-copy" aria-label="Outfit details"><span className="eyebrow">{product.brand.label}</span><h1>{product.title}</h1><div className="detail-rating"><Star size={14} fill="currentColor" /><span>{product.sample_rating == null ? "New sample listing" : `${product.sample_rating.toFixed(1)} · ${product.sample_rating_count} sample ratings`}</span></div><div className="detail-price"><strong>{money(product.rental_price_minor)}</strong><span> / 4 days</span><span className="band-tag">Band {product.band}</span></div><p className="retail">Retail {money(product.retail_price_minor)} · Sample display prices</p><p className="detail-location"><MapPin size={15} />{product.metro.label} <span>· demo location</span></p>
        <div className="detail-choice"><label htmlFor="garment-size">Your fit<span className="tiny muted">One physical garment, one listed size</span></label><select id="garment-size" value={size} onChange={event => setSize(event.target.value)}><option value="">Choose listed size</option><option value={product.size.id}>{product.size.sizing_system === "alpha" ? "Alpha" : product.size.sizing_system} · {product.size.label}</option></select><div className="measurement-strip"><Ruler size={15} />{product.measurements.map(m => <span key={m.key}>{m.key}: {m.value} {m.unit}</span>)}</div></div>
        <div className="detail-choice"><span className="choice-label">Rental dates <span className="tiny muted">Four days, including both dates</span></span><Popover wide title="Choose rental dates" trigger={<button className="date-selection"><CalendarDays size={18} /><span>{dateOnly(start) && dateOnly(end) ? `${format(dateOnly(start)!, "MMM d")} – ${format(dateOnly(end)!, "MMM d, yyyy")}` : "Choose your dates"}</span><ChevronRight size={17} /></button>}><DatePicker start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} /></Popover></div>
        <div className="detail-actions"><Button disabled={!!issue} onClick={() => { const error = useBag.getState().add(product, size, start, end); useSession.getState().notify(error ?? `${product.title} added to your bag. ${useBag.getState().lines.length} ${useBag.getState().lines.length === 1 ? "item" : "items"} in your bag.`); }}><ShoppingBag size={18} />{!product.is_available ? "Currently unavailable" : "Add to bag"}<ArrowRight size={17} /></Button><button className={`detail-save icon-button ${saved ? "saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${product.title}`} aria-pressed={saved} onClick={() => { useBag.getState().toggleSaved(product.id); useSession.getState().notify(saved ? "Outfit removed from saved looks." : "Outfit saved for later."); }}><Heart size={21} fill={saved ? "currentColor" : "none"} /></button></div>
        {issue ? <p className={size ? "field-error" : "tiny muted"} role={size ? "status" : undefined}>{issue}</p> : null}{lines.some(x => x.product.id === product.id) ? <Link className="text-button" href="/cart">View your bag<ArrowRight size={15} /></Link> : null}<p className="tiny muted">Presentation only. Adding to your bag does not reserve an outfit.</p>
        <div className="demo-policies"><Popover title="Cleaning details — demo" trigger={<button>Cleaning details — demo</button>}><p>Final cleaning terms are not configured. The presentation’s cleaning line is a sample amount only.</p></Popover><Popover title="Cancellation details — demo" trigger={<button>Cancellation details — demo</button>}><p>Final cancellation terms are not configured. This demo creates no reservation or payment.</p></Popover></div>
        <div className="detail-accordions"><details open><summary>About this outfit</summary><p>{product.description}</p><dl><dt>Fabric</dt><dd>{product.fabric}</dd><dt>Occasion</dt><dd>{product.occasion}</dd><dt>Garment type</dt><dd>{product.garment_type}</dd></dl></details><details><summary>Fit & condition</summary><dl><dt>Stretch</dt><dd>{product.stretch}</dd><dt>Alterations</dt><dd>{product.alterations}</dd><dt>Known wear</dt><dd>{product.known_wear}</dd></dl></details><details><summary>Location & demo availability</summary><p>{product.metro.label}. Location data is a small demonstration map; delivery coverage is not configured.</p><p>{product.date_blocks.length ? `Demo date blocks: ${product.date_blocks.map(b => `${b.start} – ${b.end}`).join(", ")}.` : "No date blocks in this sample listing."}</p></details></div>
      </section>
    </div><Link className="back-link" href={category ? `/?collection=${category.slug}` : "/"}><ArrowLeft size={16} />Back to the collection</Link>
  </main>;
}
export function ProductDetail({ slug }: { slug: string }) {
  const runtime = useRuntime();
  const query = useQuery({ queryKey: ["product", slug, runtime.revision], queryFn: () => api<Product>(`/catalog/products/${encodeURIComponent(slug)}`), enabled: runtime.ready, refetchInterval: runtime.demo ? false : 5000 });
  if (query.error && "status" in query.error && query.error.status === 404) return <OutfitNotFound />;
  if (query.error || runtime.error) return <main id="main-content" className="content-width"><ErrorState message={query.error?.message ?? runtime.error} retry={() => { void query.refetch(); }} /></main>;
  if (!query.data) return <main id="main-content" className="content-width detail-skeleton" aria-busy="true" aria-label="Loading outfit"><div className="skeleton-photo" /><div><div className="skeleton-line" /><div className="skeleton-line" /></div></main>;
  return <Details key={query.data.id} product={query.data} />;
}
