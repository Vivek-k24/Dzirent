"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronRight, ShoppingBag, Trash2 } from "lucide-react";
import { dateOnly, money } from "@dzirent/client";
import { format } from "date-fns";
import { useBag, useSession } from "@/lib/store";
import { presentation } from "@/lib/presentation";
import { useRuntime } from "./providers";
import { GarmentImage } from "./product-card";

export function Bag({ preview = false }: { preview?: boolean }) {
  const lines = useBag(s => s.lines), runtime = useRuntime();
  const subtotal = lines.reduce((sum, line) => sum + line.product.rental_price_minor, 0);
  return <main id="main-content" className="content-width bag-main"><div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={12} />{preview ? <><Link href="/cart">Bag</Link><ChevronRight size={12} /><span>Checkout preview</span></> : <span>Your bag</span>}</div><p className="eyebrow">A LOOK TO LOOK FORWARD TO</p><h1>{preview ? "Checkout preview" : "Your bag"}{!preview && runtime.ready ? <span> ({lines.length})</span> : null}</h1>
    {preview ? <div className="preview-notice"><Check size={20} /><div><strong>Online reservations & payments are unavailable in preview.</strong><p>This is a non-transactional preview. To reserve an outfit, contact the lender directly.</p></div></div> : <p className="muted">A few great pieces. Four days to make them your own.</p>}
    {!runtime.ready ? <p aria-busy="true">Loading your bag…</p> : !lines.length ? <div className="empty-state"><ShoppingBag size={42} strokeWidth={1.2} /><h2>Your next look awaits</h2><p>Your bag is empty. Find something for your next occasion.</p><Link href="/" className="button button-primary">Explore outfits<ArrowRight size={17} /></Link></div>
      : <div className="bag-layout"><section className="bag-lines" aria-label="Bag items">{lines.map(line => <article className="bag-line" key={line.key}><Link className="bag-photo" href={`/products/${line.product.slug}?start=${line.start}&end=${line.end}`}><GarmentImage image={line.product.image} sizes="150px" /></Link><div className="bag-line-copy"><p className="product-brand">{line.product.brand.label}</p><Link href={`/products/${line.product.slug}?start=${line.start}&end=${line.end}`} className="bag-title">{line.product.title}</Link><p>{line.product.size.sizing_system} · {line.product.size.label}</p><p className="muted">{format(dateOnly(line.start)!, "MMM d")} – {format(dateOnly(line.end)!, "MMM d, yyyy")} · 4 days</p><span className="band-tag">Band {line.product.band}</span>{!preview ? <button className="remove-line" aria-label={`Remove ${line.product.title} from bag`} onClick={() => { useBag.getState().remove(line.key); useSession.getState().notify(`${line.product.title} removed from your bag.`); }}><Trash2 size={14} />Remove</button> : null}</div><strong className="bag-line-price">{money(line.product.rental_price_minor)}</strong></article>)}</section>
        <aside className="order-summary" aria-label="Order summary"><span className="eyebrow">THE DETAILS</span><h2>{preview ? "Order summary" : "Bag summary"}</h2><dl><dt>Subtotal ({lines.length} {lines.length === 1 ? "item" : "items"})</dt><dd>{money(subtotal)}</dd><dt>Cleaning <span>· estimated</span></dt><dd>{money(presentation.cleaningMinor)}</dd><dt>Tax <span>· estimated</span></dt><dd>{money(presentation.taxMinor)}</dd><dt className="summary-total">Estimated total</dt><dd className="summary-total">{money(subtotal + presentation.cleaningMinor + presentation.taxMinor)}</dd></dl>
          {preview ? <><button type="button" className="button button-primary" disabled aria-disabled="true" title="Online payment processing is not enabled in preview">Complete Reservation (Unavailable in Preview)</button><p className="tiny muted" style={{ marginTop: 10 }}>Online checkout is currently disabled. Cleaning and tax values are illustrative estimates.</p><Link className="text-button" href="/cart"><ArrowLeft size={15} />Edit your bag</Link></> : <Link href="/checkout/preview" className="button button-primary">Checkout preview<ArrowRight size={17} /></Link>}{!preview ? <p className="tiny muted">Estimated amounts only. Dates in your bag do not hold inventory until confirmed.</p> : null}
        </aside>
      </div>}
    <Link className="back-link" href="/"><ArrowLeft size={16} />Continue exploring</Link>
  </main>;
}
