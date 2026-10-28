"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRuntime } from "../providers";
import { StudioCarousel } from "./studio-carousel";
import { outfitCount, STUDIO_DIRECTORY_PAGE } from "./types";
import type { Studio, StudioPage } from "./types";
import styles from "./studios.module.css";

function StudioCard({ studio }: { studio: Studio }) {
  const href = `/studios/${studio.handle}`;
  return <li className={styles.studioCard} data-studio-handle={studio.handle}>
    <div className={styles.studioHead}>
      <div>
        <h2 className={styles.studioName}><Link href={href}>{studio.display_name}</Link></h2>
        <p className={styles.meta}><span>Texas</span><span data-testid="studio-count">{outfitCount(studio.published_product_count)}</span></p>
      </div>
      <Link className={`${styles.button} ${styles.buttonOutline}`} href={href} aria-label={`Visit ${studio.display_name}`}>Visit Studio</Link>
    </div>
    {studio.bio ? <p className={`${styles.bio} ${styles.clamp}`}>{studio.bio}</p> : null}
    <StudioCarousel studio={studio} />
  </li>;
}

export function StudioDirectory() {
  const runtime = useRuntime();
  const query = useInfiniteQuery({
    queryKey: ["studios", runtime.revision],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<StudioPage>(`/studios?page=${pageParam}&page_size=${STUDIO_DIRECTORY_PAGE}`),
    getNextPageParam: (last, pages) => last.items.length && pages.reduce((n, page) => n + page.items.length, 0) < last.total ? last.page + 1 : undefined,
    enabled: runtime.ready,
  });
  const studios = query.data?.pages.flatMap(page => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const error = runtime.error || query.error?.message;
  return <main id="main-content" className={styles.page}>
    <div className={styles.intro}>
      <div>
        <h1 className={styles.title}>Lender Studios in Texas</h1>
        <p className={styles.lede}>A Studio is a lender’s public profile. Each preview rotates through every outfit that lender has published.</p>
      </div>
      {query.data ? <p className={styles.muted} aria-live="polite">{total} {total === 1 ? "Studio" : "Studios"}</p> : null}
    </div>
    {runtime.demo ? <p className={styles.demoNote}>Explore curated lender Studios across Texas.</p> : null}
    {error ? <div className={styles.state} role="alert"><h2>Studios didn’t load</h2><p>{error}</p><button type="button" className={`${styles.button} ${styles.buttonOutline}`} onClick={() => void query.refetch()}>Retry</button></div>
      : !query.data ? <div className={styles.state} aria-busy="true"><p>Loading Studios…</p></div>
      : !studios.length ? <div className={styles.state}><h2>No public Studios yet</h2><p>Studios appear here once a lender makes their Studio public and publishes an outfit.</p><Link className={styles.link} href="/">Browse all collections</Link></div>
      : <>
        <ul className={styles.directory} aria-label="Studios">{studios.map(studio => <StudioCard key={studio.id} studio={studio} />)}</ul>
        {query.hasNextPage ? <div className={styles.more}><button type="button" className={`${styles.button} ${styles.buttonOutline}`} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading Studios…" : "Load more Studios"}</button></div> : null}
      </>}
  </main>;
}
