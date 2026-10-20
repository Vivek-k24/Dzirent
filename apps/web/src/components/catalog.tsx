"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { ChevronRight, SearchX } from "lucide-react";
import { clearOptional, rangeError, serializeSelection } from "@dzirent/client";
import type { ProductPage } from "@dzirent/client";
import { api } from "@/lib/api";
import { useCatalogState } from "@/lib/use-catalog";
import { useReferences, useRuntime } from "./providers";
import { CollectionSidebar, FilterBar } from "./filters";
import { ProductCard } from "./product-card";
import { Button, ErrorState, Skeletons } from "./ui/primitives";

export function Catalog() {
  const { state, patch, apply } = useCatalogState(), { refs, error: referenceError, retry } = useReferences(), runtime = useRuntime();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const invalid = rangeError(state.start, state.end), filterKey = serializeSelection({ ...state, page: 1 }, true);
  const query = useInfiniteQuery<ProductPage, Error, InfiniteData<ProductPage, number>, [string, string, number], number>({
    queryKey: ["catalog", filterKey, runtime.revision], initialPageParam: 1,
    enabled: runtime.ready && !!refs && !invalid, placeholderData: previous => previous,
    queryFn: ({ pageParam, signal }) => api<ProductPage>(`/catalog/products?${serializeSelection({ ...state, page: pageParam }, true)}`, { signal }),
    getNextPageParam: last => last.page * last.page_size < last.total ? last.page + 1 : undefined,
    refetchInterval: runtime.demo ? false : 5000,
  });
  const { fetchNextPage, hasNextPage, isFetching, isError } = query, loadedPages = query.data?.pages.length ?? 0;
  useEffect(() => { if (state.page > loadedPages && loadedPages > 0 && hasNextPage && !isFetching && !isError) void fetchNextPage(); }, [state.page, loadedPages, hasNextPage, isFetching, isError, fetchNextPage]);
  const first = query.data?.pages[0], items = query.data?.pages.slice(0, state.page).flatMap(p => p.items) ?? [];
  const root = refs?.categories.find(c => c.slug === (state.category.length === 1 ? state.category[0] : state.collection));
  const total = root ? root.product_count : !query.isPlaceholderData ? first?.collection_total : undefined;
  const clear = () => apply(clearOptional(state));
  const toggleSidebar = () => setSidebarOpen(current => !current);
  return <main id="main-content" className="catalog-main content-width">
    <section className="catalog-context" aria-label="Catalog context" data-section="context">
      {root ? <div className="breadcrumbs"><Link href="/">All collections</Link><ChevronRight size={12} /><span>{root.label}</span></div> : null}
      <div className="catalog-heading"><div><h1>{root?.label ?? "All collections"} <span>({total ?? "…"})</span></h1><p className="catalog-intro">Find a rental for your next occasion. Explore listed sizes, measurements and four-day dates.</p></div>
        <p className="available-count" aria-live="polite">{first && !query.isPlaceholderData ? <><span className="status-dot" />{first.available_total} {first.available_total === 1 ? "outfit" : "outfits"} available<span className="tiny muted">{state.start ? "for your demo dates" : "in the demo catalog"}</span></> : "Loading the rental collection…"}</p>
      </div>
    </section>
    <div className={`catalog-layout ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <CollectionSidebar open={sidebarOpen} toggleSidebar={toggleSidebar} />
      <div className="catalog-content"><FilterBar />
        <section className={`catalog-results ${state.view === "list" ? "list-view" : ""}`} aria-label="Outfit results" data-section="results" data-updating={query.isPlaceholderData} aria-busy={query.isFetching}>
          {invalid ? <div className="date-error" role="alert"><h2>Check your rental dates</h2><p>{invalid}</p><Button variant="outline" onClick={() => patch({ start: "", end: "" })}>Clear invalid dates</Button></div>
            : referenceError ? <ErrorState message={referenceError} retry={retry} />
            : query.isError ? <ErrorState message={query.error.message} retry={() => { void query.refetch(); }} />
            : query.isPending || !refs ? <Skeletons />
            : !items.length ? <div className="empty-state"><SearchX size={35} strokeWidth={1.3} /><h2>No outfits for these filters</h2><p>Try another date or remove a filter to explore more of the collection.</p><Button variant="outline" onClick={clear}>Clear all filters</Button></div>
            : <><div className="results-caption"><span>{first?.total} {first?.total === 1 ? "outfit" : "outfits"}</span><span className="tiny">Sample amounts · 4-day rentals</span></div><div className="product-grid" aria-busy={query.isFetchingNextPage}>{items.map((product, index) => <ProductCard product={product} index={index} key={product.id} start={state.start} end={state.end} />)}</div><div className="results-end"><p>Showing {items.length} of {first?.total} outfits</p>{query.hasNextPage && state.page <= loadedPages ? <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => patch({ page: loadedPages + 1 })}>{query.isFetchingNextPage ? "Loading…" : "Load more"}</Button> : <span className="end-mark" aria-hidden="true" />}</div></>}
        </section>
      </div>
    </div>
  </main>;
}
