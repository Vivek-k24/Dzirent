"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Heart, Star } from "lucide-react";
import { money } from "@dzirent/client";
import type { ProductCard as Product } from "@dzirent/client";
import { useBag, useSession } from "@/lib/store";

export function GarmentImage({ image, priority = false, sizes = "(min-width: 1280px) 23vw, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, 94vw" }: { image: Product["image"]; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  return <Image fill src={failed ? "/fixtures/garment-placeholder.svg" : image.url} alt={image.alt_text} sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} onError={() => { if (!failed) setFailed(true); }} className="garment-image" />;
}
export function ProductCard({ product, index = 10, start = "", end = "" }: { product: Product; index?: number; start?: string; end?: string }) {
  const saved = useBag(s => s.wishlist.includes(product.id));
  const query = start && end ? `?start=${start}&end=${end}` : "", href = `/products/${product.slug}${query}`;
  return <article className="product-card" data-product-id={product.id}>
    <div className="product-photo"><Link href={href} className="product-photo-link" aria-label={`Rent now: ${product.brand.label} ${product.title}`}><GarmentImage key={product.image.url} image={product.image} priority={index < 4} /><span className="rent-overlay">Rent now <ArrowUpRight size={17} /></span></Link>
      <button className={`save-button ${saved ? "saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${product.title}`} aria-pressed={saved} onClick={() => { useBag.getState().toggleSaved(product.id); useSession.getState().notify(`${product.title} ${saved ? "removed from" : "added to"} your saved outfits.`); }}><Heart size={19} fill={saved ? "currentColor" : "none"} /></button>
      {!product.is_available ? <span className="unavailable-tag">Currently unavailable</span> : null}
    </div>
    <div className="product-copy"><div className="brand-rating"><span className="product-brand">{product.brand.label}</span>{product.sample_rating != null ? <span className="card-rating" aria-label={`Sample rating ${product.sample_rating} out of 5`}><Star size={11} fill="currentColor" />{product.sample_rating.toFixed(1)}</span> : <span className="card-new">New</span>}</div><Link href={href} className="product-title">{product.title}</Link><div className="card-price"><strong>{money(product.rental_price_minor)}</strong><span> · 4 days</span><span className="band-tag">Band {product.band}</span></div><p className="retail">Retail {money(product.retail_price_minor)}<span className="list-meta">{product.size.sizing_system} {product.size.label} · {product.metro.label}</span></p><p className="list-only tiny muted">Sample pricing and availability. View the outfit for fit and date details.</p></div>
  </article>;
}
