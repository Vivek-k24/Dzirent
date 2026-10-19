"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { emptySelection, parseSelection, serializeSelection } from "@dzirent/client";
import type { CatalogSelection } from "@dzirent/client";
import { useReferences } from "@/components/providers";

export function useCatalogState() {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname(), { refs } = useReferences();
  const browserParams = new URLSearchParams(params.toString());
  // These are UI defaults only. The shared parser also serves MSW and keeps the
  // existing API's featured default and legacy location semantics unchanged.
  if (!browserParams.has("sort")) browserParams.set("sort", "newest");
  browserParams.delete("metro"); browserParams.delete("zip");
  const state = parseSelection(browserParams, refs);
  function apply(next: CatalogSelection, replace = false) {
    const query = serializeSelection(next);
    const url = query ? `/?${query}` : "/";
    // Next integrates native history with useSearchParams. Catalog-only changes
    // update immediately without an unnecessary server navigation or second store.
    if (pathname === "/") { if (replace) window.history.replaceState(null, "", url); else window.history.pushState(null, "", url); }
    else if (replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false });
  }
  function patch(values: Partial<CatalogSelection>) {
    const next = { ...state, ...values, page: values.page ?? 1 };
    if (values.category && refs && next.subcategory) {
      const parent = refs.categories.find(c => c.children?.some(s => s.slug === next.subcategory));
      const effective = next.category.length ? next.category : next.collection ? [next.collection] : refs.categories.map(c => c.slug);
      if (parent && !effective.includes(parent.slug)) next.subcategory = "";
    }
    apply(next);
  }
  function navigate(collection: string, subcategory = "") { apply({ ...state, collection, subcategory, category: [], page: 1 }); }
  return { state, apply, patch, navigate, all: () => apply({ ...emptySelection(), sort: state.sort, view: state.view }) };
}
