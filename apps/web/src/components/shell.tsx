"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrowseContext, City, categories, styles } from "@/lib/types";
import { Icon } from "./icon";
import { signOut } from "@/app/actions";
import { useInboxDot, UnreadDot } from "./inbox";
import { Appearance, ThemeToggle } from "./local-preferences";
import { DistanceUnit } from "./distance";
import { dateChip, type Profile } from "@/lib/workflows";
import { WelcomeChecklistModal, GuideOverlay } from "./onboarding";
import { TermsUpdateScreen } from "./terms-update";
import {
  GuestGateDialog,
  GatedActionTrigger,
  type GatedActionKey,
} from "./guest-gate";
const ShellContext = createContext<{
  openFilters: () => void;
  openLocation: () => void;
  openGuestGate: (action: GatedActionKey) => void;
}>({
  openFilters: () => {},
  openLocation: () => {},
  openGuestGate: () => {},
});
export function UpdateLocation() {
  const { openLocation } = useContext(ShellContext);
  return (
    <button type="button" className="text-button accent" onClick={openLocation}>
      <Icon name="pin" />
      Update location
    </button>
  );
}
export function FilterButton() {
  const { openFilters } = useContext(ShellContext);
  return (
    <button className="button secondary compact" onClick={openFilters}>
      <Icon name="filter" /> Filters
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + className}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-top">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
async function preference(body: object) {
  const response = await fetch("/api/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error("Could not save your selection. Please try again.");
}
function LocationPicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/cities?q=" + encodeURIComponent(query), {
        signal: abort.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((rows: City[]) => {
          setCities(rows);
          setBusy(false);
        })
        .catch((error: Error) => {
          if (error.name !== "AbortError") {
            setMessage("City search is unavailable. Please try again.");
            setBusy(false);
          }
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  async function select(city: City) {
    setBusy(true);
    try {
      await preference({
        action: "location",
        city: city.name + ", " + city.state,
        lat: gps?.lat ?? city.lat,
        lng: gps?.lng ?? city.lng,
      });
      router.refresh();
      onClose();
    } catch {
      setMessage("Please try your selection again.");
      setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setMessage("Search for your city below.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        setMessage("Location found. Search for your city to finish.");
        setBusy(false);
      },
      () => {
        setMessage("Choose your city below to keep browsing nearby.");
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <Modal title="Find your neighborhood" onClose={onClose}>
      <p className="muted">
        Only your city and approximate distance are shown.
      </p>
      <button
        className="button secondary full"
        onClick={locate}
        disabled={busy}
      >
        <Icon name="compass" />
        {gps ? "Location found" : "Use browser location"}
      </button>
      <div className="or">
        <span>or choose a city</span>
      </div>
      <label className="field">
        <span>City</span>
        <input
          autoFocus
          placeholder="Start typing a city..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCities([]);
            setBusy(e.target.value.trim().length >= 2);
            setMessage("");
          }}
        />
      </label>
      <div aria-live="polite" className="form-message">
        {message ||
          (busy
            ? "Searching..."
            : query.length >= 2 && !cities.length
              ? "No cities found. Try another spelling."
              : "")}
      </div>
      <div className="city-results">
        {cities.map((c) => (
          <button key={c.id} onClick={() => select(c)} disabled={busy}>
            <Icon name="pin" />
            <span>
              {c.name}, {c.state}
            </span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
function DatePicker({
  ctx,
  onClose,
}: {
  ctx: BrowseContext;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await preference({
        action: "dates",
        start: f.get("start"),
        end: f.get("end"),
      });
      router.refresh();
      onClose();
    } catch {
      setError("Choose an end date on or after your start date.");
      setBusy(false);
    }
  }
  return (
    <Modal title="A date for your next look" onClose={onClose}>
      <p className="muted">See pieces available for your whole date range.</p>
      <form onSubmit={submit}>
        <div className="date-fields">
          <label className="field">
            <span>From</span>
            <input type="date" name="start" defaultValue={ctx.start} required />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" name="end" defaultValue={ctx.end} required />
          </label>
        </div>
        <p role="status" className="form-message">
          {error}
        </p>
        <button className="button full" disabled={busy}>
          Apply dates <Icon name="arrow" />
        </button>
      </form>
      {ctx.datesActive && (
        <button
          className="text-button full"
          onClick={async () => {
            await preference({ action: "clear-dates" });
            router.refresh();
            onClose();
          }}
        >
          Clear date filter
        </button>
      )}
    </Modal>
  );
}
export function Shell({
  ctx,
  authenticated,
  userId = null,
  userProfile = null,
  name,
  showWelcome,
  needsLegal = false,
  children,
}: {
  ctx: BrowseContext;
  authenticated: boolean;
  userId?: string | null;
  userProfile?: Profile | null;
  name: string;
  showWelcome: boolean;
  needsLegal?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const showTermsUpdate =
    authenticated &&
    needsLegal &&
    pathname !== "/terms" &&
    pathname !== "/privacy";
  const [location, setLocation] = useState(false);
  const [dates, setDates] = useState(false);
  const [filters, setFilters] = useState(false);
  const [welcome, setWelcome] = useState(showWelcome);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guestGateAction, setGuestGateAction] = useState<GatedActionKey | null>(
    null,
  );
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unread = useInboxDot(authenticated);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem("dzirent-desktop-filter-panel");
        if (saved !== null) {
          setDesktopFilterOpen(saved === "true");
        } else if (pathname === "/") {
          setDesktopFilterOpen(true);
        }
      } catch {}
    });
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [accountMenuOpen]);

  useEffect(() => {
    if (searchInputRef.current && typeof window !== "undefined") {
      const qParam = new URLSearchParams(window.location.search).get("q") || "";
      if (searchInputRef.current.value !== qParam) {
        searchInputRef.current.value = qParam;
      }
    }
  }, [pathname]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (val.trim()) {
        params.set("q", val.trim());
      } else {
        params.delete("q");
      }
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    }, 250);
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const val = searchInputRef.current?.value || "";
    const params = new URLSearchParams(window.location.search);
    if (val.trim()) {
      params.set("q", val.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  useEffect(() => {
    if (authenticated && userId) {
      Promise.resolve().then(() => {
        try {
          const seen = localStorage.getItem("welcome_seen_" + userId);
          if (!seen) {
            localStorage.setItem("welcome_seen_" + userId, "true");
            setChecklistOpen(true);
          }
        } catch {}
      });
    }
    const onStartTour = () => setGuideOpen(true);
    const onOpenChecklist = () => setChecklistOpen(true);
    const onOpenGate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.action) setGuestGateAction(detail.action);
    };
    window.addEventListener("dzirent-start-tour", onStartTour);
    window.addEventListener("dzirent-open-checklist", onOpenChecklist);
    window.addEventListener("dzirent-open-guest-gate", onOpenGate);
    return () => {
      window.removeEventListener("dzirent-start-tour", onStartTour);
      window.removeEventListener("dzirent-open-checklist", onOpenChecklist);
      window.removeEventListener("dzirent-open-guest-gate", onOpenGate);
    };
  }, [authenticated, userId]);
  function handleMenuClick() {
    setDefaults(
      Object.fromEntries(new URLSearchParams(window.location.search)),
    );
    if (typeof window !== "undefined" && window.innerWidth >= 1280) {
      setDesktopFilterOpen((prev) => {
        const next = !prev;
        try {
          localStorage.setItem("dzirent-desktop-filter-panel", String(next));
        } catch {}
        return next;
      });
    } else {
      setFilters(true);
    }
  }
  function openFilters() {
    setDefaults(
      Object.fromEntries(new URLSearchParams(window.location.search)),
    );
    if (typeof window !== "undefined" && window.innerWidth >= 1280) {
      setDesktopFilterOpen(true);
      try {
        localStorage.setItem("dzirent-desktop-filter-panel", "true");
      } catch {}
    } else {
      setFilters(true);
    }
  }
  const dateLabel = dateChip(ctx.start, ctx.end);
  async function dismissWelcome(path?: string) {
    try {
      await preference({ action: "welcome" });
    } catch {
      /* The current visit can still browse. */
    }
    setWelcome(false);
    if (path) router.push(path);
  }
  return (
    <ShellContext.Provider
      value={{
        openFilters,
        openLocation: () => setLocation(true),
        openGuestGate: (action: GatedActionKey) => setGuestGateAction(action),
      }}
    >
      <DistanceUnit unit={ctx.distanceUnit}>
        <Appearance />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="announcement">
          A wardrobe worth sharing. A community close to home.
        </div>
        <header className="site-header">
          <div className="topbar">
            <div className="top-left">
              <button
                className="icon-button menu-button"
                aria-label={desktopFilterOpen ? "Close filters" : "Open menu and filters"}
                title="Menu and filters"
                onClick={handleMenuClick}
              >
                <Icon name="menu" />
              </button>
              <Link href="/about#how-it-works" className="how-works-link">
                How Dzirent works
              </Link>
            </div>
            <Link href="/" className="brand" aria-label="Dzirent home">
              <Image
                src="/logo-mark.svg"
                alt=""
                width={35}
                height={35}
                priority
              />
              <Image
                src="/logo-wordmark.svg"
                alt="DZIRENT"
                width={143}
                height={26}
                priority
              />
            </Link>
            <div className="top-right">
              <GatedActionTrigger
                action="list"
                authenticated={authenticated}
                href="/app/closet"
                className="icon-button top-action-btn top-closet-btn"
                title="My closet"
                aria-label="My closet"
              >
                <Icon name="hanger" />
              </GatedActionTrigger>
              <GatedActionTrigger
                action="list"
                authenticated={authenticated}
                href="/app/list-a-piece"
                className="icon-button top-action-btn top-list-btn"
                title="List a piece"
                aria-label="List a piece"
              >
                <Icon name="plus" />
              </GatedActionTrigger>
              <span className="top-divider" aria-hidden="true" />
              <GatedActionTrigger
                action="message"
                authenticated={authenticated}
                href="/app/messages"
                className="icon-button top-action-btn top-inbox-btn"
                title="Inbox"
                aria-label="Inbox"
              >
                <Icon name="mail" />
                {unread && <UnreadDot />}
              </GatedActionTrigger>
              <GatedActionTrigger
                action="save"
                authenticated={authenticated}
                href="/saved"
                className="icon-button top-action-btn top-saved-btn"
                title="Saved pieces"
                aria-label="Saved pieces"
              >
                <Icon name="bookmark" />
              </GatedActionTrigger>
              <div className="account-menu-wrapper" ref={accountMenuRef}>
                <button
                  type="button"
                  className="icon-button top-action-btn top-account-btn"
                  title={authenticated ? "Your account" : "Sign in"}
                  aria-label={authenticated ? "Your account" : "Sign in"}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                >
                  <Icon name="user" />
                </button>
                {accountMenuOpen && (
                  <div className="account-dropdown-menu" role="menu">
                    {authenticated ? (
                      <>
                        <div className="account-dropdown-header">
                          <strong>{name}</strong>
                          <small>Your neighborhood wardrobe</small>
                        </div>
                        <Link
                          href="/app/settings"
                          className="account-dropdown-item"
                          onClick={() => setAccountMenuOpen(false)}
                        >
                          <Icon name="user" />
                          <span>Profile & settings</span>
                        </Link>
                        <form
                          action={signOut}
                          onSubmit={() => setAccountMenuOpen(false)}
                        >
                          <button
                            type="submit"
                            className="account-dropdown-item account-signout"
                          >
                            <Icon name="arrow" />
                            <span>Sign out</span>
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        <div className="account-dropdown-header">
                          <strong>Welcome to Dzirent</strong>
                          <small>A little more you, with an account</small>
                        </div>
                        <Link
                          href="/auth?mode=signin"
                          className="account-dropdown-item"
                          onClick={() => setAccountMenuOpen(false)}
                        >
                          <Icon name="user" />
                          <span>Sign in / sign up</span>
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
              <span className="top-theme-btn">
                <ThemeToggle />
              </span>
            </div>
          </div>
          <div className="search-bar-row">
            <div className="search-bar-inner">
              <form
                action="/"
                method="GET"
                className="search-pill"
                role="search"
                onSubmit={handleSearchSubmit}
              >
                <Icon name="search" />
                <input
                  ref={searchInputRef}
                  id="search-input"
                  type="search"
                  name="q"
                  placeholder="Search pieces, styles, occasions..."
                  defaultValue=""
                  onChange={handleSearchChange}
                  aria-label="Search pieces, styles, occasions"
                />
              </form>
              <div className="search-bar-actions">
                <button
                  type="button"
                  className={"date-chip " + (ctx.datesActive ? "active" : "")}
                  onClick={() => setDates(true)}
                  title="Choose dates"
                  aria-label="Choose dates"
                >
                  <Icon name="calendar" />
                  <span>{dateLabel}</span>
                  <span className="date-caption">
                    {ctx.datesActive ? "Your dates" : "Choose dates"}
                  </span>
                </button>
                <button
                  type="button"
                  className="location-button"
                  onClick={() => setLocation(true)}
                  title="Change location"
                  aria-label="Change location"
                >
                  <Icon name="pin" />
                  <span>{ctx.city}</span>
                  <span className="location-change">Change</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        <div
          className={
            "site-body" +
            (desktopFilterOpen && !showTermsUpdate ? " filter-open" : "")
          }
        >
          {!showTermsUpdate && (
            <aside
              className={
                "desktop-docked-panel " +
                (desktopFilterOpen ? "open" : "closed")
              }
              aria-label="Filters"
            >
            <div className="docked-panel-inner">
              <div className="docked-panel-top">
                <h3 className="filter-heading">
                  <Icon name="filter" /> All categories
                </h3>
                <button
                  type="button"
                  className="icon-button panel-close-btn"
                  title="Close filter panel"
                  aria-label="Close filter panel"
                  onClick={() => {
                    setDesktopFilterOpen(false);
                    try {
                      localStorage.setItem(
                        "dzirent-desktop-filter-panel",
                        "false",
                      );
                    } catch {}
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
              <form action="/" className="filter-form">
                <input
                  type="hidden"
                  name="q"
                  value={defaults.q || ""}
                />
                <input type="hidden" name="sort" value={defaults.sort || ""} />
                <label className="field">
                  <span>Category</span>
                  <select
                    name="category"
                    defaultValue={defaults.category || ""}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <div className="form-pair">
                  <label className="field">
                    <span>Size</span>
                    <select name="size" defaultValue={defaults.size || ""}>
                      <option value="">Any size</option>
                      {["XS", "S", "M", "L", "XL", "XXL", "One Size"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="field">
                    <span>Distance</span>
                    <select
                      name="radius"
                      defaultValue={defaults.radius || String(ctx.radiusMiles)}
                    >
                      <option value="any">Any distance</option>
                      {(ctx.distanceUnit === "km"
                        ? [2, 5, 10, 25, 50, 100]
                        : [1, 3, 5, 15, 25, 50, 100]
                      ).map((n) => (
                        <option
                          key={n}
                          value={ctx.distanceUnit === "km" ? n / 1.609344 : n}
                        >
                          {n} {ctx.distanceUnit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-pair">
                  <label className="field">
                    <span>Min price ($)</span>
                    <input
                      name="min"
                      type="number"
                      min="0"
                      defaultValue={defaults.min}
                    />
                  </label>
                  <label className="field">
                    <span>Max price ($)</span>
                    <input
                      name="max"
                      type="number"
                      min="0"
                      defaultValue={defaults.max}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Style</span>
                  <select name="style" defaultValue={defaults.style || ""}>
                    <option value="">All styles</option>
                    {styles.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Garment</span>
                  <select name="garment" defaultValue={defaults.garment || ""}>
                    <option value="">All pieces</option>
                    {[
                      "top",
                      "trousers",
                      "suit",
                      "dress",
                      "skirt",
                      "saree",
                      "one_size",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Accessory type</span>
                  <select name="item" defaultValue={defaults.item || ""}>
                    <option value="">All accessories</option>
                    {[
                      "Sunglasses",
                      "Handbag",
                      "Tie",
                      "Watch (non-smart)",
                      "Belt buckle",
                      "Costume jewelry",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  <button className="button">
                    Show pieces <Icon name="arrow" />
                  </button>
                  <Link href="/" className="button secondary">
                    Reset
                  </Link>
                </div>
              </form>
            </div>
          </aside>
          )}
          <main id="main">
            {showTermsUpdate ? <TermsUpdateScreen /> : children}
          </main>
        </div>
        <footer>
          <div className="footer-inner">
            <div>
              <Link
                className="brand footer-brand"
                href="/"
                aria-label="Dzirent home"
              >
                <Image src="/logo-mark.svg" alt="" width={30} height={30} />
                <Image
                  src="/logo-wordmark.svg"
                  alt="DZIRENT"
                  width={124}
                  height={22}
                />
              </Link>
              <p>Your next look is closer than you think.</p>
            </div>
            <nav aria-label="Footer">
              <Link href="/help">Help</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/community-guidelines">Community guidelines</Link>
              <Link href="/copyright">Copyright</Link>
              <Link href="/safety">Safety</Link>
              <Link href="/delete-account">Delete account</Link>
              <Link href="/support">Support</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Dzirent</span>
            <span>Good pieces. More possibilities.</span>
          </div>
        </footer>
        {location && <LocationPicker onClose={() => setLocation(false)} />}
        {dates && <DatePicker ctx={ctx} onClose={() => setDates(false)} />}
        {filters && (
          <Modal
            title="Your wardrobe, your way"
            className="drawer"
            onClose={() => setFilters(false)}
          >
            <div className="drawer-profile">
              <div className="avatar">
                {authenticated ? (
                  name.slice(0, 1).toUpperCase()
                ) : (
                  <Icon name="user" />
                )}
              </div>
              <div>
                <strong>
                  {authenticated ? name : "Make yourself at home"}
                </strong>
                <p>
                  {authenticated
                    ? "Your neighborhood wardrobe"
                    : "A little more you, with an account"}
                </p>
              </div>
            </div>
            <nav className="drawer-nav">
              <Link
                href={authenticated ? "/app/settings" : "/auth"}
                onClick={() => setFilters(false)}
              >
                {authenticated ? "Profile & settings" : "Sign in / sign up"}
                <Icon name="chevron" />
              </Link>
              <GatedActionTrigger
                action="message"
                authenticated={authenticated}
                href="/app/messages"
                onClick={() => setFilters(false)}
              >
                Inbox{unread && <UnreadDot />}
                <Icon name="chevron" />
              </GatedActionTrigger>
              <GatedActionTrigger
                action="save"
                authenticated={authenticated}
                href="/saved"
                onClick={() => setFilters(false)}
              >
                Saved pieces
                <Icon name="chevron" />
              </GatedActionTrigger>
              <GatedActionTrigger
                action="list"
                authenticated={authenticated}
                href="/app/list-a-piece"
                onClick={() => setFilters(false)}
              >
                List a piece
                <Icon name="chevron" />
              </GatedActionTrigger>
              <GatedActionTrigger
                action="list"
                authenticated={authenticated}
                href="/app/closet"
                onClick={() => setFilters(false)}
              >
                My closet
                <Icon name="chevron" />
              </GatedActionTrigger>
              <Link
                href="/about#how-it-works"
                onClick={() => setFilters(false)}
              >
                How Dzirent works
                <Icon name="chevron" />
              </Link>
            </nav>
            <div className="drawer-theme-row">
              <span>Theme</span>
              <ThemeToggle />
            </div>
            <div className="drawer-context-row">
              <button
                type="button"
                className={"date-chip " + (ctx.datesActive ? "active" : "")}
                onClick={() => {
                  setFilters(false);
                  setDates(true);
                }}
              >
                <Icon name="calendar" />
                <span>{dateLabel}</span>
              </button>
              <button
                type="button"
                className="location-button"
                onClick={() => {
                  setFilters(false);
                  setLocation(true);
                }}
              >
                <Icon name="pin" />
                <span>{ctx.city}</span>
                <span className="location-change">Change</span>
              </button>
            </div>
            <h3 className="filter-heading">
              <Icon name="filter" /> All categories
            </h3>
            <form
              action="/"
              onSubmit={() => setFilters(false)}
              className="filter-form"
            >
              <input
                type="hidden"
                name="q"
                value={defaults.q || ""}
              />
              <input type="hidden" name="sort" value={defaults.sort || ""} />
              <label className="field">
                <span>Category</span>
                <select name="category" defaultValue={defaults.category || ""}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className="form-pair">
                <label className="field">
                  <span>Size</span>
                  <select name="size" defaultValue={defaults.size || ""}>
                    <option value="">Any size</option>
                    {["XS", "S", "M", "L", "XL", "XXL", "One Size"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Distance</span>
                  <select
                    name="radius"
                    defaultValue={defaults.radius || String(ctx.radiusMiles)}
                  >
                    <option value="any">Any distance</option>
                    {(ctx.distanceUnit === "km"
                      ? [2, 5, 10, 25, 50, 100]
                      : [1, 3, 5, 15, 25, 50, 100]
                    ).map((n) => (
                      <option
                        key={n}
                        value={ctx.distanceUnit === "km" ? n / 1.609344 : n}
                      >
                        {n} {ctx.distanceUnit}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-pair">
                <label className="field">
                  <span>Min price ($)</span>
                  <input
                    name="min"
                    type="number"
                    min="0"
                    defaultValue={defaults.min}
                  />
                </label>
                <label className="field">
                  <span>Max price ($)</span>
                  <input
                    name="max"
                    type="number"
                    min="0"
                    defaultValue={defaults.max}
                  />
                </label>
              </div>
              <label className="field">
                <span>Style</span>
                <select name="style" defaultValue={defaults.style || ""}>
                  <option value="">All styles</option>
                  {styles.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Garment</span>
                <select name="garment" defaultValue={defaults.garment || ""}>
                  <option value="">All pieces</option>
                  {[
                    "top",
                    "trousers",
                    "suit",
                    "dress",
                    "skirt",
                    "saree",
                    "one_size",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Accessory type</span>
                <select name="item" defaultValue={defaults.item || ""}>
                  <option value="">All accessories</option>
                  {[
                    "Sunglasses",
                    "Handbag",
                    "Tie",
                    "Watch (non-smart)",
                    "Belt buckle",
                    "Costume jewelry",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <button className="button">
                  Show pieces <Icon name="arrow" />
                </button>
                <Link
                  href="/"
                  className="button secondary"
                  onClick={() => setFilters(false)}
                >
                  Reset
                </Link>
              </div>
            </form>
            {authenticated && (
              <form action={signOut}>
                <button className="text-button signout">Sign out</button>
              </form>
            )}
          </Modal>
        )}
        {welcome && !authenticated && !pathname.startsWith("/auth") && (
          <Modal
            title="Welcome to Dzirent"
            onClose={() => dismissWelcome()}
            className="welcome-modal"
          >
            <Image
              className="welcome-mark"
              src="/logo-mark.svg"
              alt=""
              width={64}
              height={64}
            />
            <div className="eyebrow">LOOK GOOD. SHARE MORE.</div>
            <h2>
              A whole neighborhood
              <br />
              of possibilities.
            </h2>
            <p>
              Discover pieces for your next occasion, from closets close to you.
            </p>
            <button
              className="button full"
              onClick={() => dismissWelcome("/auth?mode=signup")}
            >
              Create an account <Icon name="arrow" />
            </button>
            <button
              className="button secondary full"
              onClick={() => dismissWelcome("/auth?mode=signin")}
            >
              Sign in
            </button>
            <button
              className="text-button full"
              onClick={() => dismissWelcome()}
            >
              Browse as guest <Icon name="arrow" />
            </button>
          </Modal>
        )}
        {checklistOpen && userProfile && !showTermsUpdate && (
          <WelcomeChecklistModal
            profile={userProfile}
            onOpenLocation={() => setLocation(true)}
            onStartGuide={() => setGuideOpen(true)}
            onClose={() => setChecklistOpen(false)}
          />
        )}
        {guideOpen && !showTermsUpdate && (
          <GuideOverlay
            canLend={userProfile?.role !== "renter"}
            onClose={() => setGuideOpen(false)}
          />
        )}
        {guestGateAction && (
          <GuestGateDialog
            action={guestGateAction}
            onClose={() => setGuestGateAction(null)}
          />
        )}
      </DistanceUnit>
    </ShellContext.Provider>
  );
}

export function BrowseGuest() {
  const router = useRouter();
  return (
    <button
      className="text-button guest-link"
      onClick={async () => {
        await preference({ action: "welcome" });
        router.push("/");
      }}
    >
      Browse as guest <Icon name="arrow" />
    </button>
  );
}
