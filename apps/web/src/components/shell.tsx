"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { serializeSelection } from "@dzirent/client";
import { Search, UserRound, Shirt, Plus, ShoppingBag, MapPin, ArrowRight, X, LogOut, LayoutDashboard } from "lucide-react";
import { useCatalogState } from "@/lib/use-catalog";
import { useBag, useSession } from "@/lib/store";
import { useRuntime } from "./providers";
import { Modal, Popover, PopoverClose } from "./ui/primitives";
import { Navigation } from "./navigation";
import { LocationDialog } from "./location-dialog";

function SearchInput({ mobile = false, done }: { mobile?: boolean; done?: () => void }) {
  const { state, patch } = useCatalogState(), input = useRef<HTMLInputElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (input.current && !timer.current) input.current.value = state.q; }, [state.q]);
  useEffect(() => {
    const restore = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; if (input.current) input.current.value = new URLSearchParams(window.location.search).get("q") ?? ""; };
    window.addEventListener("popstate", restore); return () => { window.removeEventListener("popstate", restore); if (timer.current) clearTimeout(timer.current); };
  }, []);
  return <form className={`search-box ${mobile ? "mobile-search-box" : ""}`} role="search" onSubmit={event => { event.preventDefault(); if (timer.current) clearTimeout(timer.current); timer.current = null; patch({ q: input.current?.value.trim() ?? "" }); done?.(); }}>
    <Search size={18} aria-hidden="true" /><input ref={input} type="search" aria-label="Search outfits" placeholder="What are you looking for?" defaultValue={state.q} maxLength={200} autoComplete="off" onChange={event => {
      if (timer.current) clearTimeout(timer.current); const value = event.currentTarget.value;
      timer.current = setTimeout(() => { timer.current = null; patch({ q: value.trim() }); }, 200);
    }} onKeyDown={event => { if (event.key === "Escape" && !mobile) { event.preventDefault(); event.stopPropagation(); if (timer.current) clearTimeout(timer.current); timer.current = null; event.currentTarget.value = ""; patch({ q: "" }); } }} />
    {mobile ? <button type="submit" className="icon-button" aria-label="Search"><ArrowRight size={20} /></button> : null}
  </form>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { demo, ready } = useRuntime(), { state } = useCatalogState();
  const user = useSession(s => s.user), notice = useSession(s => s.notice), lines = useBag(s => s.lines);
  const [search, setSearch] = useState(false), [location, setLocation] = useState(false);
  const router = useRouter(), pathname = usePathname();
  const returnTo = `${pathname}${serializeSelection(state) ? `?${serializeSelection(state)}` : ""}`;
  const deliveryZip = useBag(s => s.location.zip);
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header">
      <div className="main-header content-width"><Link href="/" className="wordmark" aria-label="dzirent home">dzirent<span className="wordmark-period">.</span></Link>
        <div className="header-search-area"><div className="desktop-search"><SearchInput /></div><p className="launch-note" style={{ whiteSpace: "nowrap" }}>Launching in Texas soon.</p></div>
        <div className="header-actions"><button className="header-action mobile-search-trigger" id="header-search" aria-label="Open search" onClick={() => setSearch(true)}><Search size={20} /><span>Search</span></button>
          <Popover title={user ? "Your demo account" : "Welcome to dzirent"} trigger={<button id="header-account" className="header-action" aria-label="Account"><UserRound size={21} /><span>Account</span></button>}>
            {user ? <div className="account-options"><p className="account-name">{user.display_name}</p><p className="tiny muted">{demo ? "Sample identity" : "Signed in"} · {user.roles.join(" / ")}</p>{user.lender_profile ? <PopoverClose asChild><Link href="/lender/dashboard"><LayoutDashboard size={16} /> Lender dashboard</Link></PopoverClose> : <PopoverClose asChild><Link href="/lender/signup">Become a lender <ArrowRight size={16} /></Link></PopoverClose>}
              <PopoverClose asChild><button onClick={() => { useSession.getState().signOut(); useSession.getState().notify("Signed out of the sample account."); router.push("/"); }}><LogOut size={16} />Sign out</button></PopoverClose>
            </div> : <div className="account-options"><p className="muted small-copy">A wardrobe for every occasion.</p>{(["renter", "lender"] as const).map(role => <div key={role}><h4>{role === "renter" ? "Rent an outfit" : "Share your wardrobe"}</h4><PopoverClose asChild><Link href={`/auth/${role}/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in as {role}<ArrowRight size={15} /></Link></PopoverClose><PopoverClose asChild><Link href={`/auth/${role}/signup?returnTo=${encodeURIComponent(returnTo)}`}>Create a {role} account</Link></PopoverClose></div>)}</div>}
          </Popover>
          <Link className="header-action" href={user?.lender_profile ? "/lender/dashboard" : "/lender/signup"} aria-label="List an outfit"><span className="shirt-icon"><Shirt size={22} /><Plus size={11} /></span><span>List an Outfit</span></Link>
          <Link className="header-action bag-action" href="/cart" aria-label={`Bag ${ready ? lines.length : 0} ${lines.length === 1 ? "item" : "items"}`}><ShoppingBag size={21} /><span>Bag </span>{ready && lines.length ? <span className="bag-badge" aria-hidden="true">{lines.length}</span> : null}</Link>
          <button id="header-location" className="header-action" aria-label={`Pickup area${deliveryZip ? `, ${deliveryZip}` : ""}`} onClick={() => setLocation(true)}><MapPin size={21} /><span>{deliveryZip || "Pickup area"}</span></button>
        </div>
      </div><Navigation />
    </header>
    {children}
    <footer className="site-footer"><div className="content-width footer-inner"><div><Link href="/" className="wordmark">dzirent.</Link><p>A fresh look. A shared wardrobe.</p></div><div><Link href="/credits">Photography & demo details</Link><Link href="/lender/signup">Share an outfit <ArrowRight size={15} /></Link></div></div><div className="content-width footer-note">Sample listings, prices, ratings and availability. No reservations, payments or delivery promises.</div></footer>
    {notice ? <div className="toast"><p key={notice.id} role="status" aria-live="polite">{notice.text}</p><button className="icon-button" aria-label="Dismiss notification" onClick={() => useSession.getState().dismiss()}><X size={17} /></button></div> : null}
    {search ? <Modal open onOpenChange={setSearch} title="Find your next look" description="Search sample titles, brands and descriptions." restoreId="header-search"><SearchInput mobile done={() => setSearch(false)} /></Modal> : null}
    {location ? <LocationDialog close={() => setLocation(false)} /> : null}
  </>;
}
