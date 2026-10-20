"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, LayoutGrid, List, PanelLeftOpen, SlidersHorizontal, X } from "lucide-react";
import { clearOptional, emptySelection, money, rangeError, serializeSelection } from "@dzirent/client";
import type { CatalogSelection, ProductPage } from "@dzirent/client";
import { api } from "@/lib/api";
import { useCatalogState } from "@/lib/use-catalog";
import { useReferences, useRuntime } from "./providers";
import { Button, Modal, Popover } from "./ui/primitives";
import { DatePicker } from "./date-picker";

type Group = "brand" | "color" | "band" | "size";
const labels: Record<Group, string> = { brand: "Brand", color: "Color", band: "Rental price", size: "Size" };
function toggle(state: CatalogSelection, group: Group, value: string): CatalogSelection {
  return { ...state, [group]: state[group].includes(value) ? state[group].filter(x => x !== value) : [...state[group], value].sort(), page: 1 };
}

function CategoryTree({ prefix }: { prefix: string }) {
  const { refs } = useReferences(), { state, patch } = useCatalogState();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const selected = state.category.length ? state.category : state.collection ? [state.collection] : [];
  if (!refs) return <p className="muted" role="status">Loading collections…</p>;
  return <fieldset className="category-tree"><legend className="sr-only">Choose collections and one subcategory</legend>
    <button className="category-all" type="button" aria-pressed={!selected.length && !state.subcategory} onClick={() => patch({ collection: "", category: [], subcategory: "" })}>All collections<span aria-hidden="true">{refs.categories.length} collections</span></button>
    <ul>{refs.categories.map(root => {
      const active = selected.includes(root.slug), open = expanded[root.slug] ?? active;
      const childrenId = `${prefix}-${root.slug}`;
      return <li className="category-node" key={root.id}>
        <div className="category-parent"><label><input type="checkbox" checked={active} onChange={() => patch({ collection: "", category: active ? selected.filter(slug => slug !== root.slug) : [...selected, root.slug].sort(), subcategory: "" })} /><span>{root.label}</span><span className="category-count" aria-hidden="true">{root.product_count}</span></label>
          <button type="button" className="category-expand" aria-label={`${open ? "Collapse" : "Expand"} ${root.label} subcategories`} aria-expanded={open} aria-controls={childrenId} onClick={() => setExpanded(current => ({ ...current, [root.slug]: !open }))}><ChevronDown size={16} aria-hidden="true" /></button>
        </div>
        <ul id={childrenId} className="category-children" hidden={!open}>{root.children?.map(child => <li key={child.id}><button type="button" aria-pressed={state.subcategory === child.slug} onClick={() => patch({ collection: "", category: active ? selected : [root.slug], subcategory: state.subcategory === child.slug ? "" : child.slug })}>{child.label}<span aria-hidden="true">{child.product_count}</span></button></li>)}</ul>
      </li>;
    })}</ul>
    <p className="category-help">Choose collections to browse together, or one subcategory to narrow your search.</p>
  </fieldset>;
}

export function CollectionSidebar({ open, toggleSidebar }: { open: boolean; toggleSidebar: () => void }) {
  return <aside id="collection-sidebar" className={`collection-sidebar ${open ? "is-open" : "is-collapsed"}`} aria-label="Categories navigation">
    <button id="toggle-categories" className="category-sidebar-toggle" type="button"
      aria-label={open ? "Hide categories" : "Show categories"}
      aria-expanded={open} aria-controls="category-sidebar-content" onClick={toggleSidebar}>
      <span>Categories</span><ChevronDown className="category-sidebar-chevron" size={18} aria-hidden="true" />
    </button>
    <div id="category-sidebar-content" hidden={!open}><CategoryTree prefix="desktop-categories" /></div>
  </aside>;
}

export function FilterChoices({ group, value, onChange }: { group: Group; value: CatalogSelection; onChange: (next: CatalogSelection) => void }) {
  const { refs } = useReferences(), [search, setSearch] = useState("");
  const options: { id: string; label: string; color?: string }[] = !refs ? []
    : group === "brand" ? refs.facets.brands.map(x => ({ id: x.id, label: x.label }))
    : group === "color" ? refs.facets.colors.map(x => ({ id: x.slug, label: x.label, color: x.swatch_hex }))
    : group === "size" ? refs.facets.sizes.map(x => ({ id: x.id, label: `${x.sizing_system === "alpha" ? "Alpha" : x.sizing_system} · ${x.label}` }))
    : refs.facets.bands.map(x => ({ id: x.id, label: `Band ${x.id} · ${x.max_minor_exclusive == null ? `${money(x.min_minor)}+` : `${money(x.min_minor)}–${money(x.max_minor_exclusive - 1)}`}` }));
  return <fieldset className={`filter-choices choices-${group}`}><legend className="sr-only">{labels[group]}</legend>
    {group === "brand" ? <input type="search" className="brand-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a brand" aria-label="Find a brand" /> : null}
    {options.filter(x => x.label.toLowerCase().includes(search.toLowerCase())).map(option => <label className="choice" key={option.id}><input type="checkbox" checked={value[group].includes(option.id)} onChange={() => onChange(toggle(value, group, option.id))} />{option.color ? <span className="color-swatch" style={{ backgroundColor: option.color }} aria-hidden="true" /> : null}<span>{option.label}</span></label>)}
    {group === "band" ? <p className="tiny muted">Four-day sample rental amounts.</p> : null}
  </fieldset>;
}

export function FilterBar() {
  const { state, apply, patch } = useCatalogState(), { refs } = useReferences(), runtime = useRuntime();
  const [sheet, setSheet] = useState(false), [categories, setCategories] = useState(false);
  const [draft, setDraft] = useState<CatalogSelection>(emptySelection);
  const invalidDraft = rangeError(draft.start, draft.end);
  const draftQuery = useQuery({ queryKey: ["draft-count", serializeSelection(draft, true), runtime.revision], enabled: runtime.ready && sheet && !!refs && !invalidDraft, queryFn: () => api<ProductPage>(`/catalog/products?${serializeSelection({ ...draft, page: 1 }, true)}&page_size=1`) });
  const count = draftQuery.data?.total;
  const clear = () => apply(clearOptional(state));
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (state.q) chips.push({ key: "q", label: `Search: ${state.q}`, remove: () => patch({ q: "" }) });
  if (state.collection) chips.push({ key: "collection", label: refs?.categories.find(c => c.slug === state.collection)?.label ?? state.collection, remove: () => patch({ collection: "", subcategory: "" }) });
  for (const category of state.category) chips.push({ key: `category-${category}`, label: refs?.categories.find(c => c.slug === category)?.label ?? category, remove: () => patch({ category: state.category.filter(value => value !== category), subcategory: "" }) });
  if (state.subcategory) chips.push({ key: "subcategory", label: refs?.categories.flatMap(c => c.children ?? []).find(c => c.slug === state.subcategory)?.label ?? state.subcategory, remove: () => patch({ subcategory: "" }) });
  for (const group of Object.keys(labels) as Group[]) for (const value of state[group]) {
    const label = group === "brand" ? refs?.facets.brands.find(b => b.id === value)?.label : group === "color" ? refs?.facets.colors.find(c => c.slug === value)?.label : group === "band" ? `Band ${value}` : refs?.facets.sizes.find(s => s.id === value);
    chips.push({ key: `${group}-${value}`, label: typeof label === "string" ? label : label ? `${label.sizing_system} · ${label.label}` : value, remove: () => patch({ [group]: state[group].filter(v => v !== value) }) });
  }
  if (state.start || state.end) chips.push({ key: "dates", label: `${state.start || "Start?"} – ${state.end || "End?"}`, remove: () => patch({ start: "", end: "" }) });
  return <section className="catalog-controls" aria-label="Catalog controls" data-section="controls">
    <div className="filter-toolbar">
      <Modal side="left" open={categories} onOpenChange={setCategories} title="Categories" description="Browse collections together, or choose one subcategory." trigger={<button className="all-filters mobile-category-trigger" type="button"><PanelLeftOpen size={17} />Categories</button>}>
        <CategoryTree prefix="mobile-categories" /><Button onClick={() => setCategories(false)}>View outfits</Button>
      </Modal>
      <button id="all-filters-trigger" className="all-filters" type="button" onClick={() => { setDraft({ ...state, page: 1 }); setSheet(true); }}><SlidersHorizontal size={17} />Filters {chips.length ? <span className="filter-count">{chips.length}</span> : null}</button>
      <div className="facet-buttons"><Popover wide title="Rental dates" trigger={<button className={`filter-trigger ${state.start ? "applied" : ""}`}><CalendarDays size={16} />{state.start ? "4-day dates" : "Rental Dates"}<ChevronDown size={13} /></button>}><DatePicker start={state.start} end={state.end} onChange={(start, end) => patch({ start, end })} /></Popover>
        {(Object.keys(labels) as Group[]).map(group => <span className="filter-control" key={group}><Popover title={labels[group]} trigger={<button className={`filter-trigger ${state[group].length ? "applied" : ""}`}>{labels[group]}{state[group].length ? ` · ${state[group].length}` : ""}<ChevronDown size={13} /></button>}><FilterChoices group={group} value={state} onChange={apply} /></Popover>{state[group].length ? <button className="filter-clear" aria-label={`Clear ${labels[group]}`} onClick={() => patch({ [group]: [] })}><X size={12} /></button> : null}</span>)}
      </div>
      <div className="view-sort"><label htmlFor="catalog-sort" className="sr-only">Sort outfits</label><select id="catalog-sort" value={state.sort} onChange={event => patch({ sort: event.target.value as CatalogSelection["sort"] })}><option value="newest">Newest first</option><option value="featured">Featured Items</option><option value="price_asc">Price Low to High</option><option value="price_desc">Price High to Low</option><option value="top_rated">Top Rated</option></select><span className="view-switch"><button aria-label="Grid view" aria-pressed={state.view === "grid"} className={state.view === "grid" ? "active" : ""} onClick={() => patch({ view: "grid", page: state.page })}><LayoutGrid size={18} /></button><button aria-label="List view" aria-pressed={state.view === "list"} className={state.view === "list" ? "active" : ""} onClick={() => patch({ view: "list", page: state.page })}><List size={19} /></button></span></div>
    </div>
    {chips.length ? <div className="active-chips" aria-label="Applied filters">{chips.map(chip => <button key={chip.key} className="active-chip" onClick={chip.remove} aria-label={`Remove ${chip.label}`}>{chip.label}<X size={12} /></button>)}<button className="text-button clear-all" onClick={clear}>Clear all</button></div> : null}
    <Modal open={sheet} onOpenChange={setSheet} side="right" title="Find your fit" description="Choose filters, then apply them together. Closing discards your edits." restoreId="all-filters-trigger">
      <div className="filter-sheet-body"><section><h3>Rental dates</h3><DatePicker start={draft.start} end={draft.end} onChange={(start, end) => setDraft(d => ({ ...d, start, end }))} /></section>{(Object.keys(labels) as Group[]).map(group => <section key={group}><h3>{labels[group]}</h3><FilterChoices group={group} value={draft} onChange={setDraft} /></section>)}</div>
      {invalidDraft ? <p className="field-error" role="alert">{invalidDraft}</p> : null}{draftQuery.isError ? <p className="field-error" role="alert">The result count could not load. Close and reopen filters to retry.</p> : null}
      <div className="filter-sheet-footer"><button className="text-button" onClick={() => setDraft(clearOptional(draft))}>Clear all</button><Button disabled={!!invalidDraft || draftQuery.isFetching || count == null || draftQuery.isError} onClick={() => { apply(draft); setSheet(false); }}>Show {count ?? "…"} {count === 1 ? "result" : "results"}</Button></div>
    </Modal>
  </section>;
}
