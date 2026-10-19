"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { useReferences } from "./providers";
import { useCatalogState } from "@/lib/use-catalog";
import { Modal } from "./ui/primitives";

export function Navigation() {
  const { refs } = useReferences(), { state, navigate, all, patch } = useCatalogState();
  const [drawer, setDrawer] = useState(false), [active, setActive] = useState("");
  const container = useRef<HTMLElement>(null), triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const suppressFocus = useRef(false);
  const collection = refs?.categories.find(c => c.slug === active);
  const close = (slug: string) => { suppressFocus.current = true; setActive(""); triggers.current[slug]?.focus(); requestAnimationFrame(() => { suppressFocus.current = false; }); };
  useEffect(() => {
    function outside(event: PointerEvent) { if (event.target instanceof Node && !container.current?.contains(event.target)) setActive(""); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const choose = (slug: string, child = "") => { setActive(""); setDrawer(false); navigate(slug, child); };
  return <nav ref={container} className="category-nav" aria-label="Collections" onKeyDown={event => {
    if (event.key === "Escape" && active) { event.preventDefault(); close(active); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(""); }}>
    <div className="category-inner content-width">
      <Modal side="left" open={drawer} onOpenChange={setDrawer} title="Shop all collections" description="Find a look for whatever’s next."
        trigger={<button id="shop-all" className="shop-all"><Menu size={18} /><span>Shop All</span></button>}>
        <div className="drawer-collections"><button className="drawer-all" onClick={() => { all(); setDrawer(false); }}>All outfits <ArrowRight size={17} /></button>
          {refs?.categories.map(root => <div className="drawer-collection" key={root.id}><button onClick={() => choose(root.slug)}>{root.label}<span>{root.product_count}</span></button><div>{root.children?.map(child => <button key={child.id} onClick={() => choose(root.slug, child.slug)}>{child.label}</button>)}</div></div>)}
        </div><Link href="/auth/lender/login" className="drawer-lender" onClick={() => setDrawer(false)}>Sign in as lender <ArrowRight size={17} /></Link>
      </Modal>
      <div className="collection-links" role="region" aria-label="Browse collections" tabIndex={0}>{refs ? refs.categories.map(root => <button key={root.id} ref={element => { triggers.current[root.slug] = element; }}
        className={`collection-link ${state.collection === root.slug ? "selected" : ""}`} aria-expanded={active === root.slug} aria-controls={`mega-${root.slug}`}
        onMouseEnter={() => setActive(root.slug)} onFocus={event => { if (!suppressFocus.current && event.currentTarget.matches(":focus-visible")) setActive(root.slug); }}
        onClick={() => setActive(root.slug)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setActive(root.slug); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#mega-${root.slug} button[data-first]`)?.focus()); } }}>
        {root.label}<ChevronDown size={12} />
      </button>) : <div className="nav-loading">Women <span>Men</span><span>Party & Cocktail</span><span>Suits & Tuxedos</span><span>Wedding Guest</span><span>Indian & Cultural</span><span>Designer</span><span>Bridal</span></div>}</div>
    </div>
    {collection ? <div className="mega-menu" id={`mega-${collection.slug}`} role="region" aria-label={`${collection.label} collection`} onMouseLeave={() => setActive("")}>
      <div className="mega-inner content-width"><div className="mega-subcategories"><p className="eyebrow">Explore {collection.label}</p><button data-first className="mega-all" onClick={() => choose(collection.slug)}>Shop the collection <ArrowRight size={18} /></button><h3>Subcategories</h3>{collection.children?.map(c => <button key={c.id} onClick={() => choose(collection.slug, c.slug)}>{c.label}</button>)}</div>
        <div><h3>Occasion</h3>{refs?.facets.occasions.map(value => <span className="mega-value" key={value}>{value}</span>)}<p className="tiny muted">Find occasion details on each outfit.</p></div>
        <div><h3>Fabric</h3>{refs?.facets.fabrics.map(value => <span className="mega-value" key={value}>{value}</span>)}</div>
        <div><h3>Price <span className="muted">· sample</span></h3>{refs?.facets.bands.map(b => <button key={b.id} onClick={() => { setActive(""); patch({ collection: collection.slug, category: [], subcategory: "", band: [b.id] }); }}>Band {b.id}<span className="muted">{b.id === "A" ? "Under $50" : b.id === "B" ? "$50–$99.99" : b.id === "C" ? "$100–$149.99" : "$150+"}</span></button>)}<p className="tiny muted">Four-day sample display ranges.</p></div>
        <button className="mega-close icon-button" aria-label={`Close ${collection.label} menu`} onClick={() => close(collection.slug)}><X size={19} /></button>
      </div>
    </div> : null}
  </nav>;
}
