"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import { clearOptional, emptySelection, money, rangeError, serializeSelection } from "@dzirent/client";
import type { CatalogSelection, ProductPage } from "@dzirent/client";
import { api } from "@/lib/api";
import { useBag } from "@/lib/store";
import { useCatalogState } from "@/lib/use-catalog";
import { useReferences, useRuntime } from "./providers";
import { Button, Modal, Popover } from "./ui/primitives";
import { DatePicker } from "./date-picker";

type Group = "category" | "brand" | "color" | "band" | "size";
const labels: Record<Group, string> = { category: "Category", brand: "Brand", color: "Color", band: "Price Band", size: "Size" };
function toggle(state: CatalogSelection, group: Group, value: string): CatalogSelection {
  return { ...state, [group]: state[group].includes(value) ? state[group].filter(x => x !== value) : [...state[group], value].sort(), ...(group === "category" ? { subcategory: "" } : {}), page: 1 };
}
export function FilterChoices({ group, value, onChange }: { group: Group; value: CatalogSelection; onChange: (next: CatalogSelection) => void }) {
  const { refs } = useReferences(), [search, setSearch] = useState("");
  const options: { id: string; label: string; color?: string }[] = !refs ? [] : group === "category" ? refs.categories.map(x => ({ id: x.slug, label: `${x.label} (${x.product_count})` }))
    : group === "brand" ? refs.facets.brands.map(x => ({ id: x.id, label: x.label }))
    : group === "color" ? refs.facets.colors.map(x => ({ id: x.slug, label: x.label, color: x.swatch_hex }))
    : group === "size" ? refs.facets.sizes.map(x => ({ id: x.id, label: `${x.sizing_system === "alpha" ? "Alpha" : x.sizing_system} · ${x.label}` }))
    : refs.facets.bands.map(x => ({ id: x.id, label: `Band ${x.id} · ${x.max_minor_exclusive == null ? `${money(x.min_minor)}+` : `${money(x.min_minor)}–${money(x.max_minor_exclusive - 1)}`}` }));
  return <fieldset className={`filter-choices choices-${group}`}><legend className="sr-only">{labels[group]}</legend>
    {group === "brand" ? <input type="search" className="brand-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a brand" aria-label="Find a brand" /> : null}
    {options.filter(x => x.label.toLowerCase().includes(search.toLowerCase())).map(option => <label className="choice" key={option.id}><input type="checkbox" checked={value[group].includes(option.id)} onChange={() => onChange(toggle(value, group, option.id))} />{option.color ? <span className="color-swatch" style={{ backgroundColor: option.color }} aria-hidden="true" /> : null}<span>{option.label}</span></label>)}
    {group === "band" ? <p className="tiny muted">Four-day sample amounts. Final pricing terms are not configured.</p> : null}
  </fieldset>;
}

export function SubcategoryPills() {
  const { refs } = useReferences(), { state, patch } = useCatalogState(), scroll = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ left: false, right: false });
  const root = refs?.categories.find(c => c.slug === state.collection);
  function measure() { const el = scroll.current; if (el) setBounds({ left: el.scrollLeft > 2, right: el.scrollWidth - el.clientWidth - el.scrollLeft > 2 }); }
  useEffect(() => { const el = scroll.current; if (!el) return; const observer = new ResizeObserver(measure); observer.observe(el); return () => observer.disconnect(); }, [root?.id]);
  return <div className="pills-row"><button className={`pill-arrow ${bounds.left ? "" : "invisible"}`} aria-label="Scroll subcategories left" onClick={() => scroll.current?.scrollBy({ left: -200, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronLeft size={17} /></button>
    <div className="subcategory-pills" ref={scroll} onScroll={measure} aria-label="Subcategories"><button className={`pill ${!state.subcategory ? "active" : ""}`} aria-pressed={!state.subcategory} onClick={() => patch({ subcategory: "" })}>All</button>{root?.children?.map(c => <button className={`pill ${state.subcategory === c.slug ? "active" : ""}`} key={c.id} aria-pressed={state.subcategory === c.slug} onClick={() => patch({ subcategory: c.slug })}>{c.label}</button>)}</div>
    <button className={`pill-arrow ${bounds.right ? "" : "invisible"}`} aria-label="Scroll subcategories right" onClick={() => scroll.current?.scrollBy({ left: 200, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronRight size={17} /></button>
  </div>;
}

export function FilterBar() {
  const { state, apply, patch } = useCatalogState(), { refs } = useReferences(), runtime = useRuntime();
  const [sheet, setSheet] = useState(false), [draft, setDraft] = useState<CatalogSelection>(emptySelection);
  const invalidDraft = rangeError(draft.start, draft.end);
  const draftQuery = useQuery({ queryKey: ["draft-count", serializeSelection(draft, true), runtime.revision], enabled: sheet && !!refs && !invalidDraft, queryFn: () => api<ProductPage>(`/catalog/products?${serializeSelection({ ...draft, page: 1 }, true)}&page_size=1`) });
  const count = draftQuery.data?.total;
  const clear = () => { useBag.getState().setLocation({ metro: "", zip: "" }); apply(clearOptional(state)); };
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (state.q) chips.push({ key: "q", label: `Search: ${state.q}`, remove: () => patch({ q: "" }) });
  if (state.subcategory) chips.push({ key: "subcategory", label: refs?.categories.flatMap(c => c.children ?? []).find(c => c.slug === state.subcategory)?.label ?? state.subcategory, remove: () => patch({ subcategory: "" }) });
  for (const group of Object.keys(labels) as Group[]) for (const value of state[group]) {
    const label = group === "category" ? refs?.categories.find(c => c.slug === value)?.label : group === "brand" ? refs?.facets.brands.find(b => b.id === value)?.label : group === "color" ? refs?.facets.colors.find(c => c.slug === value)?.label : group === "band" ? `Band ${value}` : refs?.facets.sizes.find(s => s.id === value);
    chips.push({ key: `${group}-${value}`, label: typeof label === "string" ? label : label ? `${label.sizing_system} · ${label.label}` : value, remove: () => patch({ [group]: state[group].filter(v => v !== value), ...(group === "category" ? { subcategory: "" } : {}) }) });
  }
  if (state.start || state.end) chips.push({ key: "dates", label: `${state.start || "Start?"} – ${state.end || "End?"}`, remove: () => patch({ start: "", end: "" }) });
  if (state.metro || state.zip) chips.push({ key: "location", label: `${refs?.locations.items.find(m => m.slug === state.metro)?.label ?? "Demo location"}${state.zip ? ` · ${state.zip}` : ""}`, remove: () => { useBag.getState().setLocation({ metro: "", zip: "" }); patch({ metro: "", zip: "" }); } });
  return <section className="catalog-controls" aria-label="Catalog controls" data-section="controls">
    <div className="filter-toolbar"><button className="all-filters" onClick={() => { setDraft({ ...state, page: 1 }); setSheet(true); }}><SlidersHorizontal size={17} />Filters {chips.length ? <span className="filter-count">{chips.length}</span> : null}</button>
      <div className="facet-buttons"><Popover wide title="Rental dates" trigger={<button className={`filter-trigger ${state.start ? "applied" : ""}`}><CalendarDays size={16} />{state.start ? "4-day dates" : "Rental Dates"}<ChevronDown size={13} /></button>}><DatePicker start={state.start} end={state.end} onChange={(start, end) => patch({ start, end })} /></Popover>
        {(Object.keys(labels) as Group[]).map(group => <span className="filter-control" key={group}><Popover title={labels[group]} trigger={<button className={`filter-trigger ${state[group].length ? "applied" : ""}`}>{labels[group]}{state[group].length ? ` · ${state[group].length}` : ""}<ChevronDown size={13} /></button>}><FilterChoices group={group} value={state} onChange={apply} /></Popover>{state[group].length ? <button className="filter-clear" aria-label={`Clear ${labels[group]}`} onClick={() => patch({ [group]: [] })}><X size={12} /></button> : null}</span>)}
      </div><div className="view-sort"><label htmlFor="catalog-sort" className="sr-only">Sort outfits</label><select id="catalog-sort" value={state.sort} onChange={event => patch({ sort: event.target.value as CatalogSelection["sort"] })}><option value="featured">Featured Items</option><option value="price_asc">Price Low to High</option><option value="price_desc">Price High to Low</option><option value="newest">Newest</option><option value="top_rated">Top Rated</option></select><span className="view-switch"><button aria-label="Grid view" aria-pressed={state.view === "grid"} className={state.view === "grid" ? "active" : ""} onClick={() => patch({ view: "grid", page: state.page })}><LayoutGrid size={18} /></button><button aria-label="List view" aria-pressed={state.view === "list"} className={state.view === "list" ? "active" : ""} onClick={() => patch({ view: "list", page: state.page })}><List size={19} /></button></span></div>
    </div>
    {chips.length ? <div className="active-chips" aria-label="Applied filters">{chips.map(chip => <button key={chip.key} className="active-chip" onClick={chip.remove} aria-label={`Remove ${chip.label}`}>{chip.label}<X size={12} /></button>)}<button className="text-button clear-all" onClick={clear}>Clear all</button></div> : null}
    <Modal open={sheet} onOpenChange={setSheet} side="right" title="Find your fit" description="Choose filters, then apply them together. Closing discards your edits.">
      <div className="filter-sheet-body"><section><h3>Rental dates</h3><DatePicker start={draft.start} end={draft.end} onChange={(start, end) => setDraft(d => ({ ...d, start, end }))} /></section>{(Object.keys(labels) as Group[]).map(group => <section key={group}><h3>{labels[group]}</h3><FilterChoices group={group} value={draft} onChange={setDraft} /></section>)}</div>
      <div className="filter-sheet-footer"><button className="text-button" onClick={() => setDraft(d => ({ ...clearOptional(d), q: d.q, metro: d.metro, zip: d.zip }))}>Clear all</button><Button disabled={!!invalidDraft || draftQuery.isFetching || draftQuery.isError || count == null} onClick={() => { apply(draft); setSheet(false); }}>Show {count ?? "…"} results</Button></div>{draftQuery.error ? <p role="alert" className="field-error">{draftQuery.error.message}</p> : null}
    </Modal>
  </section>;
}
