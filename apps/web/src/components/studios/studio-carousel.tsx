"use client";
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useRuntime } from "../providers";
import { StudioImage, useNarrowViewport, usePrefersReducedMotion } from "./studio-image";
import { sizeLabel, STUDIO_CAROUSEL_PAGE } from "./types";
import type { Studio, StudioProduct, StudioProductPage } from "./types";
import styles from "./studios.module.css";

const ROTATE_MS = 5000;

export function useStudioProducts(handle: string, pageSize: number, loadAll: boolean) {
  const runtime = useRuntime();
  const query = useInfiniteQuery({
    queryKey: ["studio-products", handle, pageSize, runtime.revision],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<StudioProductPage>(`/studios/${encodeURIComponent(handle)}/products?page=${pageParam}&page_size=${pageSize}`),
    getNextPageParam: (last, pages) => last.items.length && pages.reduce((n, page) => n + page.items.length, 0) < last.total ? last.page + 1 : undefined,
    enabled: runtime.ready,
  });
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  // The carousel must reach every published outfit, so it keeps requesting later API pages.
  useEffect(() => { if (loadAll && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage(); }, [loadAll, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap(page => page.items).filter(item => !seen.has(item.id) && seen.add(item.id));
  }, [query.data]);
  return { query, items, total: query.data?.pages[0]?.total };
}

function positions(indices: number[], total: number) {
  const contiguous = indices.every((value, i) => i === 0 || value === indices[i - 1] + 1);
  const shown = indices.map(i => i + 1);
  return contiguous && shown.length > 1 ? `Outfits ${shown[0]}–${shown[shown.length - 1]} of ${total}` : `Outfit${shown.length > 1 ? "s" : ""} ${shown.join(", ")} of ${total}`;
}

function Slide({ product }: { product: StudioProduct }) {
  // Preview content is deliberately limited to portrait photo, title and listed size.
  const displayTitle = (product as unknown as { editorial_title?: string }).editorial_title || product.title;
  return <li className={styles.slide} data-product-id={product.id}>
    <Link className={styles.slideLink} href={`/products/${product.slug}`}>
      <StudioImage product={product} sizes="(min-width: 1440px) 210px, (min-width: 1024px) 15vw, (min-width: 640px) 30vw, 45vw" />
      <span className={styles.slideTitle}>{displayTitle}</span>
      <span className={styles.size}>{sizeLabel(product.size)}</span>
    </Link>
  </li>;
}

export function StudioCarousel({ studio }: { studio: Studio }) {
  const { query, items, total = studio.published_product_count } = useStudioProducts(studio.handle, STUDIO_CAROUSEL_PAGE, true);
  const reducedMotion = usePrefersReducedMotion(), narrow = useNarrowViewport();
  const instructionsId = useId();
  const visible = narrow ? 2 : 3;
  const [start, setStart] = useState(0), [paused, setPaused] = useState(false), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const count = items.length, canRotate = count > visible;
  const automatic = canRotate && !reducedMotion && !paused && !hovered && !focused;
  const first = count ? start % count : 0;
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => setStart(value => (value + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [automatic, count]);

  const label = `${studio.display_name} outfits`;
  if (query.isError) return <div className={styles.state} role="alert"><p>{query.error.message || "Outfits could not load."}</p><button type="button" className={`${styles.button} ${styles.buttonOutline}`} onClick={() => void query.refetch()}>Retry</button></div>;
  if (!count) return <div className={styles.track} aria-busy="true" aria-label={`Loading ${label}`}>{Array.from({ length: visible }, (_, i) => <div key={i} className={styles.skeleton} />)}</div>;

  const indices = Array.from({ length: Math.min(visible, count) }, (_, i) => (first + i) % count);
  const step = (delta: number) => setStart(value => ((value % count) + delta + count) % count);
  return <section className={styles.carousel} aria-roledescription="carousel" aria-label={label} aria-describedby={instructionsId} data-studio-carousel={studio.handle}
    tabIndex={canRotate && !reducedMotion ? 0 : undefined}
    onKeyDown={event => { if (event.target === event.currentTarget && event.key === " ") { event.preventDefault(); setPaused(value => !value); } }}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <ul className={styles.track}>{indices.map(index => <Slide key={items[index].id} product={items[index]} />)}</ul>
    <div className={styles.imageControls}>
      <button type="button" className={styles.control} aria-label="Previous outfit" disabled={!canRotate} onClick={() => step(-1)}><ChevronLeft size={34} strokeWidth={2.5} aria-hidden="true" /></button>
      <button type="button" className={styles.control} aria-label="Next outfit" disabled={!canRotate} onClick={() => step(1)}><ChevronRight size={34} strokeWidth={2.5} aria-hidden="true" /></button>
    </div>
    <p id={instructionsId} className={styles.srOnly}>Outfits rotate automatically unless reduced motion is enabled. Hover or focus to pause. Focus this carousel and press Space to keep rotation paused or resume it after leaving.</p>
    <p className={styles.srOnly} data-studio-position aria-live={automatic ? "off" : "polite"} aria-atomic="true">
      {positions(indices, total)}{count < total ? ` · loading ${total - count} more` : ""}
    </p>
  </section>;
}
