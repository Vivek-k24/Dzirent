"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, SearchX } from "lucide-react";
import { clearOptional, rangeError, serializeSelection } from "@dzirent/client";
import type { ProductPage } from "@dzirent/client";
import { api } from "@/lib/api";
import { useCatalogState } from "@/lib/use-catalog";
import { useBag } from "@/lib/store";
import { useReferences, useRuntime } from "./providers";
import { FilterBar, SubcategoryPills } from "./filters";
import { ProductCard } from "./product-card";
import { Button, ErrorState, Skeletons } from "./ui/primitives";

export function Catalog() {
  const { state, patch, apply, navigate } = useCatalogState(), { refs, error: referenceError, retry } = useReferences(), runtime = useRuntime();
  const invalid = rangeError(state.start, state.end), filterKey = serializeSelection({ ...state, page: 1 }, true);
  const query = useInfiniteQuery<ProductPage, Error, InfiniteData<ProductPage, number>, [string, string, number], number>({ queryKey: ["catalog", filterKey, runtime.revision], initialPageParam: 1,
    enabled: runtime.ready && !!refs && !invalid,
    placeholderData: previous => previous,
    queryFn: ({ pageParam, signal }) => api<ProductPage>(`/catalog/products?${serializeSelection({ ...state, page: pageParam }, true)}`, { signal }),
    getNextPageParam: last => last.page * last.page_size < last.total ? last.page + 1 : undefined,
    refetchInterval: runtime.demo ? false : 5000,
  });
  const { fetchNextPage, hasNextPage, isFetching, isError } = query, loadedPages = query.data?.pages.length ?? 0;
  useEffect(() => { if (state.page > loadedPages && loadedPages > 0 && hasNextPage && !isFetching && !isError) void fetchNextPage(); }, [state.page, loadedPages, hasNextPage, isFetching, isError, fetchNextPage]);
  const first = query.data?.pages[0], items = query.data?.pages.slice(0, state.page).flatMap(p => p.items) ?? [];
  const root = refs?.categories.find(c => c.slug === state.collection);
  const total = root ? root.product_count : !query.isPlaceholderData ? first?.collection_total : undefined;
  const clear = () => { useBag.getState().setLocation({ metro: "", zip: "" }); apply(clearOptional(state)); };
  return <main id="main-content" className="catalog-main content-width">
    <section className="merchandising" aria-label="The occasion edit" data-section="merchandising"><div className="edit-panel"><span className="eyebrow">THE OCCASION EDIT</span><h2>A fresh look.<br /><em>A new story.</em></h2><button onClick={() => navigate("party-cocktail")}>Find your next occasion <ArrowRight size={17} /></button><span className="hero-detail" aria-hidden="true">01 / 08</span></div><button className="feature-panel" onClick={() => navigate("indian-cultural")}><div><span className="eyebrow">DRESSED TO CELEBRATE</span><h2>Tradition, reimagined.</h2><span>Explore Indian & Cultural <ArrowRight size={16} /></span></div><span className="feature-image" aria-hidden="true" /></button></section>
    <section className="catalog-context" aria-label="Catalog context" data-section="context"><div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={12} /><span>{root?.label ?? "All collections"}</span></div><div className="catalog-heading"><div><p className="eyebrow">A WARDROBE OF POSSIBILITIES</p><h1>{root?.label ?? "Trending outfits"} <span>({total ?? "…"})</span></h1></div><p className="available-count" aria-live="polite">{first && !query.isPlaceholderData ? <><span className="status-dot" />{first.available_total} {first.available_total === 1 ? "outfit" : "outfits"} available<span className="tiny muted">{state.start ? "for your demo dates" : "in the demo catalog"}</span></> : "Finding your next look…"}</p></div><SubcategoryPills /></section>
    <FilterBar />
    <section className={`catalog-results ${state.view === "list" ? "list-view" : ""}`} aria-label="Outfit results" data-section="results" data-updating={query.isPlaceholderData} aria-busy={query.isFetching}>
      {invalid ? <div className="date-error" role="alert"><h2>Check your rental dates</h2><p>{invalid}</p><Button variant="outline" onClick={() => patch({ start: "", end: "" })}>Clear invalid dates</Button></div>
        : referenceError ? <ErrorState message={referenceError} retry={retry} />
        : query.isError ? <ErrorState message={query.error.message} retry={() => { void query.refetch(); }} />
        : query.isPending || !refs ? <Skeletons />
        : !items.length ? <div className="empty-state"><SearchX size={35} strokeWidth={1.3} /><h2>No outfits just yet</h2><p>A different date or a little less filtering might be the perfect fit.</p><Button variant="outline" onClick={clear}>Clear all filters</Button></div>
        : <><div className="results-caption"><span>{first?.total} {first?.total === 1 ? "look" : "looks"} to make your own</span><span className="tiny">Sample prices · 4-day rentals</span></div><div className="product-grid" aria-busy={query.isFetchingNextPage}>{items.map((p, i) => <ProductCard product={p} index={i} key={p.id} start={state.start} end={state.end} />)}</div><div className="results-end"><p>Showing {items.length} of {first?.total} outfits</p>{query.hasNextPage && state.page <= loadedPages ? <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => patch({ page: loadedPages + 1 })}>{query.isFetchingNextPage ? "Loading…" : "Load more"}</Button> : <span className="end-mark" aria-hidden="true" />}</div></>}
    </section>
  </main>;
}
