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
  children,
}: {
  ctx: BrowseContext;
  authenticated: boolean;
  userId?: string | null;
  userProfile?: Profile | null;
  name: string;
  showWelcome: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
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
  const unread = useInboxDot(authenticated);

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
  function openFilters() {
    setDefaults(
      Object.fromEntries(new URLSearchParams(window.location.search)),
    );
    setFilters(true);
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
                aria-label="Open menu and filters"
                onClick={openFilters}
              >
                <Icon name="menu" />
              </button>
              <span className="desktop-label">Made for your next occasion</span>
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
              <button
                className="location-button"
                onClick={() => setLocation(true)}
              >
                <Icon name="pin" />
                <span>{ctx.city}</span>
                <span className="location-change">Change</span>
              </button>
              <ThemeToggle />
              <Link
                className="icon-button desktop-account"
                href={authenticated ? "/app/settings" : "/auth"}
                aria-label={authenticated ? "Your account" : "Sign in"}
              >
                <Icon name="user" />
              </Link>
            </div>
          </div>
          <div className="subbar">
            <nav aria-label="Main navigation" className="desktop-nav">
              <Link
                href="/"
                aria-current={pathname === "/" ? "page" : undefined}
              >
                Discover
              </Link>
              <Link
                href="/search"
                aria-current={pathname === "/search" ? "page" : undefined}
              >
                Search
              </Link>
              <GatedActionTrigger
                action="save"
                authenticated={authenticated}
                href="/saved"
              >
                Saved
              </GatedActionTrigger>
              <GatedActionTrigger
                action="message"
                authenticated={authenticated}
                href="/app/messages"
              >
                Inbox{unread && <UnreadDot />}
              </GatedActionTrigger>
              <Link href="/about">About</Link>
            </nav>
            <button
              className={"date-chip " + (ctx.datesActive ? "active" : "")}
              onClick={() => setDates(true)}
            >
              <Icon name="calendar" />
              {dateLabel}
              <span className="date-caption">
                {ctx.datesActive ? "Your dates" : "Choose dates"}
              </span>
            </button>
            <GatedActionTrigger
              action="list"
              authenticated={authenticated}
              href="/app/list-a-piece"
              className="list-link"
            >
              <Icon name="plus" /> List a piece
            </GatedActionTrigger>
          </div>
        </header>
        <main id="main">{children}</main>
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
              <Link href="/about">About Dzirent</Link>
              <Link href="/about#how-it-works">How it works</Link>
              <Link href="/about#rental-guidelines">Rental guidelines</Link>
              <a href="mailto:support@dzirent.com">Get in touch</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Dzirent</span>
            <span>Good pieces. More possibilities.</span>
          </div>
        </footer>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          <Link
            href="/"
            className={pathname === "/" ? "current" : ""}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            <Icon name="home" />
            <span>Home</span>
          </Link>
          <GatedActionTrigger
            action="message"
            authenticated={authenticated}
            href="/app/messages"
            className={pathname === "/app/messages" ? "current" : ""}
          >
            <Icon name="message" />
            {unread && <UnreadDot />}
            <span>Inbox</span>
          </GatedActionTrigger>
          <Link
            href="/search"
            className={
              "center-search " + (pathname === "/search" ? "current" : "")
            }
            aria-current={pathname === "/search" ? "page" : undefined}
          >
            <Icon name="search" />
            <span>Search</span>
          </Link>
          <GatedActionTrigger
            action="list"
            authenticated={authenticated}
            href="/app/closet"
            className={pathname === "/app/closet" ? "current" : ""}
          >
            <Icon name="closet" />
            <span>Closet</span>
          </GatedActionTrigger>
          <GatedActionTrigger
            action="save"
            authenticated={authenticated}
            href="/saved"
            className={pathname === "/saved" ? "current" : ""}
          >
            <Icon name="bookmark" />
            <span>Saved</span>
          </GatedActionTrigger>
        </nav>
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
                action="list"
                authenticated={authenticated}
                href="/app/closet"
                onClick={() => setFilters(false)}
              >
                My closet
                <Icon name="chevron" />
              </GatedActionTrigger>
            </nav>
            <h3 className="filter-heading">
              <Icon name="filter" /> All categories
            </h3>
            <form
              action="/search"
              onSubmit={() => setFilters(false)}
              className="filter-form"
            >
              <input type="hidden" name="q" value={defaults.q || ""} />
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
                  href="/search"
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
        {checklistOpen && userProfile && (
          <WelcomeChecklistModal
            profile={userProfile}
            onOpenLocation={() => setLocation(true)}
            onStartGuide={() => setGuideOpen(true)}
            onClose={() => setChecklistOpen(false)}
          />
        )}
        {guideOpen && (
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
