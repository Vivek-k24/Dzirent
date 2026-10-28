"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@dzirent/client";
import { api } from "@/lib/api";
import { useRuntime } from "../providers";
import { useStudioProducts } from "./studio-carousel";
import { StudioImage } from "./studio-image";
import { outfitCount, sizeLabel, STUDIO_WARDROBE_PAGE } from "./types";
import type { Studio } from "./types";
import styles from "./studios.module.css";

function Wardrobe({ studio }: { studio: Studio }) {
  const { query, items, total = studio.published_product_count } = useStudioProducts(studio.handle, STUDIO_WARDROBE_PAGE, false);
  if (query.isError) return <div className={styles.state} role="alert"><p>{query.error.message || "Outfits could not load."}</p><button type="button" className={`${styles.button} ${styles.buttonOutline}`} onClick={() => void query.refetch()}>Retry</button></div>;
  if (!query.data) return <div className={styles.state} aria-busy="true"><p>Loading outfits…</p></div>;
  if (!total) return <div className={styles.state}><h2>No published outfits yet</h2><p>This Studio hasn’t published an outfit. Check back later or explore other Studios.</p></div>;
  return <>
    <ul className={styles.wardrobe} aria-label={`${studio.display_name} wardrobe`}>
      {items.map(product => <li key={product.id} data-product-id={product.id}>
        <Link className={styles.cardLink} href={`/products/${product.slug}`}>
          <div style={{ position: "relative" }}>
            <StudioImage product={product} sizes="(min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw" />
            {!product.is_available ? <span className={styles.tag}>Currently unavailable</span> : null}
          </div>
          <span className={styles.slideTitle}>{product.title}</span>
          <span className={styles.size}>{sizeLabel(product.size)}</span>
        </Link>
      </li>)}
    </ul>
    <p className={styles.muted} aria-live="polite" style={{ marginTop: 18 }}>Showing {items.length} of {total}</p>
    {query.hasNextPage ? <div className={styles.more}><button type="button" className={`${styles.button} ${styles.buttonOutline}`} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading outfits…" : "Load more outfits"}</button></div> : null}
  </>;
}

export function StudioProfile({ handle }: { handle: string }) {
  const runtime = useRuntime();
  const query = useQuery({ queryKey: ["studio", handle, runtime.revision], queryFn: () => api<Studio>(`/studios/${encodeURIComponent(handle)}`), enabled: runtime.ready });
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const studio = query.data;
  return <main id="main-content" className={styles.page}>
    <Link className={`${styles.link} ${styles.back}`} href="/studios">← Explore Studios</Link>
    {missing ? <div className={styles.state} role="status"><h1 className={styles.title}>Studio not available</h1><p>This Studio doesn’t exist or isn’t public right now.</p><Link className={styles.link} href="/studios">See public Studios</Link></div>
      : runtime.error || query.error ? <div className={styles.state} role="alert"><h2>This Studio didn’t load</h2><p>{runtime.error || query.error?.message}</p><button type="button" className={`${styles.button} ${styles.buttonOutline}`} onClick={() => void query.refetch()}>Retry</button></div>
      : !studio ? <div className={styles.state} aria-busy="true"><p>Loading Studio…</p></div>
      : <>
        <header className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>Studio</p>
            <h1 className={styles.title}>{studio.display_name}</h1>
            <p className={styles.meta}><span>Texas</span><span data-testid="studio-count">{outfitCount(studio.published_product_count)}</span></p>
            {studio.bio ? <p className={styles.bio}>{studio.bio}</p> : null}
          </div>
        </header>
        {runtime.demo ? <p className={styles.demoNote}>Curated Texas Studio collection.</p> : null}
        <Wardrobe studio={studio} />
      </>}
  </main>;
}
