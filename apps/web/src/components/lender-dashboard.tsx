"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowRight, CalendarDays, Check, ExternalLink, Pencil, Plus, Search, Shirt } from "lucide-react";
import { money } from "@dzirent/client";
import type { LenderProductPage, ProductDetail, ProductWrite } from "@dzirent/client";
import { api } from "@/lib/api";
import { useSession } from "@/lib/store";
import { AuthDialog } from "./auth-dialog";
import { ListingForm } from "./listing-form";
import { useReferences, useRuntime } from "./providers";
import { Button, ErrorState, Modal } from "./ui/primitives";
import { GarmentImage } from "./product-card";

async function allListings(): Promise<ProductDetail[]> {
  const items: ProductDetail[] = [];
  for (let page = 1; ; page++) {
    const result = await api<LenderProductPage>(`/lender/products?page=${page}&page_size=100`, { protected: true });
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) return items;
  }
}

function Dashboard() {
  const user = useSession(s => s.user)!, runtime = useRuntime(), { refs, error: refError, retry } = useReferences(), client = useQueryClient();
  const key = ["lender-products", user.id, runtime.revision];
  const query = useQuery({ queryKey: key, queryFn: allListings, enabled: runtime.ready });
  const [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [editing, setEditing] = useState<ProductDetail | "new" | null>(null), [archiving, setArchiving] = useState<ProductDetail | null>(null), [archiveError, setArchiveError] = useState("");
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["lender-products"] }), client.invalidateQueries({ queryKey: ["catalog"] }), client.invalidateQueries({ queryKey: ["product"] }), client.invalidateQueries({ queryKey: ["references"] })]); };
  const save = useMutation({ mutationFn: async (data: ProductWrite) => editing && editing !== "new"
    ? api<ProductDetail>(`/lender/products/${editing.id}`, { method: "PATCH", protected: true, body: JSON.stringify({ expected_version: editing.version, data }) })
    : api<ProductDetail>("/lender/products", { method: "POST", protected: true, body: JSON.stringify(data) }),
  onSuccess: async product => { setEditing(null); await refresh(); useSession.getState().notify(`Mock listing ${product.status === "published" ? "published" : "saved as draft"}.`); } });
  const archive = useMutation({ mutationFn: (product: ProductDetail) => api<ProductDetail>(`/lender/products/${product.id}?expected_version=${product.version}`, { method: "DELETE", protected: true }),
    onSuccess: async () => { setArchiving(null); await refresh(); useSession.getState().notify("Mock listing archived and removed from the public catalog."); }, onError: error => setArchiveError(error.message) });
  const availability = useMutation({
    mutationFn: (product: ProductDetail) => api<ProductDetail>(`/lender/products/${product.id}`, { method: "PATCH", protected: true, body: JSON.stringify({ expected_version: product.version, is_available: !product.is_available }) }),
    onMutate: async product => { await client.cancelQueries({ queryKey: key }); const previous = client.getQueryData<ProductDetail[]>(key); client.setQueryData<ProductDetail[]>(key, items => items?.map(item => item.id === product.id ? { ...item, is_available: !item.is_available } : item)); return { previous }; },
    onError: (error, _product, context) => { if (context?.previous) client.setQueryData(key, context.previous); useSession.getState().notify(`${error.message} Availability was restored.`); },
    onSuccess: product => { client.setQueryData<ProductDetail[]>(key, items => items?.map(item => item.id === product.id ? product : item)); useSession.getState().notify(`Mock availability ${product.is_available ? "enabled" : "paused"}.`); },
    onSettled: () => refresh(),
  });
  const items = query.data ?? [], published = items.filter(p => p.status === "published"), visible = items.filter(p => (status === "all" || p.status === status) && `${p.title} ${p.brand.label}`.toLowerCase().includes(search.toLowerCase()));
  if (runtime.error || refError || query.error) return <main id="main-content" className="content-width"><ErrorState message={runtime.error || refError || query.error?.message || "Listings could not load."} retry={() => { retry(); void query.refetch(); }} /></main>;
  return <main id="main-content" className="content-width dashboard"><div className="page-intro"><div><span className="eyebrow">YOUR SHARED WARDROBE</span><h1>Hello, {user.display_name}.</h1><p className="muted">Manage your outfits and make room for their next occasion.</p></div><Button id="create-listing-trigger" disabled={!refs || !query.data} onClick={() => setEditing("new")}><Plus size={17} />Create listing</Button></div>
    <p className="demo-note">MOCK DASHBOARD · Session-only changes. Rentals and earnings below are sample placeholders; no transaction is recorded.</p>
    <div className="dashboard-stats"><div><Shirt size={20} /><span>Active listings</span><strong>{query.data ? published.length : "—"}</strong><small>{published.filter(p => p.is_available).length} currently available</small></div><div><CalendarDays size={20} /><span>Sample rentals</span><strong>0</strong><small>No reservations in this prototype</small></div><div><span className="stat-dollar">$</span><span>Sample earnings</span><strong>$0.00</strong><small>Display only · no payouts</small></div></div>
    <section className="wardrobe-section" aria-label="Your listings"><div className="wardrobe-toolbar"><h2>Your outfits <span className="muted">({items.length})</span></h2><div><label className="wardrobe-search"><Search size={16} /><input aria-label="Search your listings" type="search" placeholder="Search your wardrobe" value={search} onChange={event => setSearch(event.target.value)} /></label><label><span className="sr-only">Listing status</span><select aria-label="Listing status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label></div></div>
      {!query.data ? <div className="dashboard-loading" aria-busy="true">Loading your sample wardrobe…</div> : !visible.length ? <div className="empty-state"><Shirt size={32} /><h3>{items.length ? "No matching outfits" : "Your wardrobe starts here"}</h3><p>{items.length ? "Try another search or status." : "Create your first mock listing using a licensed fixture photo."}</p><Button variant="outline" onClick={() => items.length ? (setSearch(""), setStatus("all")) : setEditing("new")}>{items.length ? "Clear search & status" : "Create your first listing"}<ArrowRight size={16} /></Button></div>
        : <div className="listing-table"><div className="listing-table-head"><span>Outfit</span><span>Sample rental</span><span>Status / availability</span><span>Manage</span></div>{visible.map(product => <article className="listing-row" key={product.id} data-listing-id={product.id}><div className="listing-identity"><div className="listing-thumb"><GarmentImage image={product.image} sizes="72px" /></div><div><span className="tiny muted">{product.brand.label}</span><h3>{product.title}</h3><p className="tiny muted">{product.size.sizing_system} · {product.size.label} · v{product.version}</p></div></div><div className="listing-price">{money(product.rental_price_minor)}<span className="tiny muted"> / 4 days · Band {product.band}</span></div><div className="listing-status"><span className={`status-tag status-${product.status}`}>{product.status}</span><label className="availability-toggle"><input type="checkbox" role="switch" aria-label={`Availability for ${product.title}`} checked={product.is_available} disabled={availability.isPending || save.isPending || archive.isPending || product.status === "archived"} onChange={() => availability.mutate(product)} /><span>{product.is_available ? "Available" : "Paused"}</span></label></div><div className="listing-actions"><button id={`edit-${product.id}`} className="icon-button" aria-label={`Edit ${product.title}`} onClick={() => { save.reset(); setEditing(product); }} disabled={availability.isPending || archive.isPending}><Pencil size={17} /></button>{product.status === "published" ? <Link className="icon-button" href={`/products/${product.slug}`} aria-label={`View ${product.title}`}><ExternalLink size={17} /></Link> : null}<button id={`archive-${product.id}`} className="icon-button" aria-label={`Archive ${product.title}`} disabled={product.status === "archived" || availability.isPending || archive.isPending} onClick={() => { setArchiveError(""); setArchiving(product); }}><Archive size={17} /></button></div></article>)}</div>}
    </section><p className="tiny muted dashboard-footnote"><Check size={14} />You see only listings owned by this sample identity. A newly enrolled sample renter begins with an empty wardrobe.</p>
    <Modal open={!!editing} onOpenChange={open => { if (!open && !save.isPending) setEditing(null); }} side="right" title={editing === "new" ? "Create a mock listing" : "Edit mock listing"} description="One garment. Its fit, its story, its next occasion." restoreId={editing === "new" ? "create-listing-trigger" : editing ? `edit-${editing.id}` : undefined}>
      {editing && refs ? <ListingForm key={editing === "new" ? "new" : `${editing.id}-${editing.version}`} product={editing === "new" ? undefined : editing} refs={refs} pending={save.isPending} close={() => setEditing(null)} save={data => save.mutateAsync(data).then(() => {})} /> : null}
    </Modal>
    <Modal open={!!archiving} onOpenChange={open => { if (!open && !archive.isPending) setArchiving(null); }} title="Archive this outfit?" description="This removes it from the public demo catalog. You can edit and republish it from your wardrobe." restoreId={archiving ? `archive-${archiving.id}` : undefined}><div className="stack-form"><p>{archiving?.title}</p>{archiveError ? <p className="field-error" role="alert">{archiveError}</p> : null}<Button disabled={archive.isPending} onClick={() => archiving && archive.mutate(archiving)}><Archive size={16} />{archive.isPending ? "Archiving…" : "Archive mock listing"}</Button><Button variant="outline" disabled={archive.isPending} onClick={() => setArchiving(null)}>Keep listing</Button></div></Modal>
  </main>;
}

export function LenderDashboard() {
  const user = useSession(s => s.user);
  if (!user?.lender_profile) return <><main id="main-content" className="content-width dashboard-access"><Shirt size={32} /><h1>Your lender workspace</h1><p>Use a sample lender identity or enroll your sample renter profile.</p><Link href="/">Return to the collection</Link></main><AuthDialog role="lender" action="login" /></>;
  return <Dashboard key={user.id} />;
}
