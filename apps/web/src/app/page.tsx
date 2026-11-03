import Link from "next/link";
import { browse, context, fit, studioCards } from "@/lib/data";
import { currentUser } from "@/lib/supabase/server";
import { Card, Query, value } from "@/lib/types";
import { photoUrl } from "@/lib/supabase/config";
import { PieceCard, PieceGrid, StudioCards } from "@/components/cards";
import { Tabs } from "@/components/tabs";
import { Photo } from "@/components/photo";
import { Icon } from "@/components/icon";
import { GatedActionTrigger } from "@/components/guest-gate";
import { FilterButton } from "@/components/shell";
import { SortDropdown } from "@/components/sort-dropdown";

function Row({
  title,
  subtitle,
  cards,
  href,
  accent = false,
}: {
  title: string;
  subtitle?: string;
  cards: Card[];
  href: string;
  accent?: boolean;
}) {
  if (!cards.length) return null;
  return (
    <section className="home-row">
      <div className="section-heading">
        <div>
          <h2 className={accent ? "accent" : ""}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <Link className="text-link" href={href}>
          See all <Icon name="arrow" />
        </Link>
      </div>
      <div className="horizontal-cards">
        {cards.slice(0, 8).map((c) => (
          <PieceCard key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const [ctx, user, q] = await Promise.all([
    context(),
    currentUser(),
    searchParams,
  ]);

  const term = value(q, "q");
  const row = value(q, "row");
  const isSearching = Boolean(
    term ||
      row ||
      value(q, "category") ||
      value(q, "size") ||
      value(q, "style") ||
      value(q, "garment") ||
      value(q, "item") ||
      value(q, "min") ||
      value(q, "max") ||
      (value(q, "radius") && value(q, "radius") !== "any") ||
      value(q, "sort")
  );

  if (isSearching) {
    const searchResults = await browse(ctx, q);
    const page = Math.max(0, Number(value(q, "page")) || 0);
    const title =
      row === "new"
        ? "New near you"
        : row === "under"
          ? "Under $15"
          : row === "studios"
            ? "From studios you saved"
            : term
              ? "A little closer to “" + term + "”"
              : "Search results";

    const pageLink = (n: number) => {
      const params = new URLSearchParams();
      Object.entries(q).forEach(([k, v]) => {
        if (v && k !== "page") params.set(k, Array.isArray(v) ? v[0] : v);
      });
      params.set("page", String(n));
      return "/?" + params.toString();
    };

    return (
      <div className="page-width search-page">
        <div className="page-heading">
          <span className="eyebrow">YOUR NEIGHBORHOOD, WELL DRESSED</span>
          <h1>{title}</h1>
          <p>Good finds from closets around {ctx.city}.</p>
        </div>
        <div className="search-controls">
          <div>
            <FilterButton />
            {value(q, "category") && (
              <span className="filter-tag">{value(q, "category")}</span>
            )}
            {value(q, "size") && (
              <span className="filter-tag">Size {value(q, "size")}</span>
            )}
            {value(q, "style") && (
              <span className="filter-tag">{value(q, "style")}</span>
            )}
            <span className="muted result-text">
              {searchResults.length}
              {searchResults.length === 30 ? "+" : ""} pieces
            </span>
          </div>
          <SortDropdown q={q} term={term} action="/" />
        </div>
        <PieceGrid cards={searchResults} />
        <nav className="pagination" aria-label="Search pages">
          {page > 0 && (
            <Link
              className="button secondary compact"
              href={pageLink(page - 1)}
            >
              <Icon name="arrow" style={{ transform: "rotate(180deg)" }} /> Previous
            </Link>
          )}
          {searchResults.length === 30 && (
            <Link className="button compact" href={pageLink(page + 1)}>
              Next <Icon name="arrow" />
            </Link>
          )}
        </nav>
      </div>
    );
  }

  const [cards, newCards, budget, fits, fromSaved] = await Promise.all([
    browse(ctx),
    browse(ctx, { row: "new" }),
    browse(ctx, { row: "under" }),
    user ? fit(ctx) : Promise.resolve([]),
    user ? browse(ctx, { row: "studios" }) : Promise.resolve([]),
  ]);
  const hero = cards[2] || cards[0];
  const secondary = cards[0];

  return (
    <div className="home page-width">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="small-line" /> THE NEIGHBORHOOD WARDROBE
          </span>
          <h1>
            Your next look.
            <br />
            <span>A little closer.</span>
          </h1>
          <p>
            For the big plans, the little moments,
            <br className="desktop-only" /> and everything you haven’t dressed
            for yet.
          </p>
          <a href="#search-input" className="button">
            Find your next piece <Icon name="arrow" />
          </a>
          <div className="hero-footnote">
            <Icon name="pin" />
            <span>Local closets. More possibilities.</span>
          </div>
        </div>
        <div className="hero-visual">
          {hero && (
            <Link
              href={"/listing/" + hero.id}
              className="hero-photo hero-photo-one"
              aria-label={hero.title}
            >
              <Photo
                src={photoUrl(hero.cover_photo_path)}
                alt={hero.title}
                priority
                sizes="(max-width:760px) 45vw, 28vw"
              />
            </Link>
          )}
          {secondary && (
            <Link
              href={"/listing/" + secondary.id}
              className="hero-photo hero-photo-two"
              aria-label={secondary.title}
            >
              <Photo
                src={photoUrl(secondary.cover_photo_path)}
                alt={secondary.title}
                priority
                sizes="(max-width:760px) 35vw, 20vw"
              />
            </Link>
          )}
          <div className="hero-label">
            <span>
              GOOD PIECES.
              <br />
              NEW MEMORIES.
            </span>
            <Icon name="sparkle" />
          </div>
        </div>
      </section>
      <div className="intro-line">
        <span>Borrow a little inspiration.</span>
      </div>
      {fits.length > 0 ? (
        <Row
          title="Likely to fit you"
          subtitle="Matched to your measurements"
          cards={fits}
          href="/fit"
          accent
        />
      ) : (
        <GatedActionTrigger
          action="fit"
          authenticated={Boolean(user)}
          href="/app/settings"
          className="fit-banner"
        >
          <span className="fit-symbol">
            <Icon name="sparkle" />
          </span>
          <div>
            <span className="eyebrow">A MORE PERSONAL FIT</span>
            <h2>Good style. Your size.</h2>
            <p>Add your measurements to see what’s likely to fit you.</p>
          </div>
          <span className="fit-cta">
            {user ? "Add measurements" : "Find your fit"} <Icon name="arrow" />
          </span>
        </GatedActionTrigger>
      )}
      <Row
        title="New near you"
        subtitle="Fresh finds from local closets"
        cards={newCards}
        href="/?row=new"
      />
      {budget.length >= 3 && (
        <Row
          title="Under $15"
          subtitle="Small price. Plenty of possibility."
          cards={budget}
          href="/?row=under"
        />
      )}
      {fromSaved.length >= 3 && (
        <Row
          title="From studios you saved"
          cards={fromSaved}
          href="/?row=studios"
        />
      )}
      <section className="explore-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THERE’S MORE IN THE NEIGHBORHOOD</span>
            <h2>Find something that feels like you.</h2>
          </div>
          <span className="result-count">{cards.length} pieces to explore</span>
        </div>
        <Tabs
          labels={["Products", "Studios"]}
          initial={value(q, "tab") === "studios" ? 1 : 0}
        >
          {[
            <PieceGrid key="products" cards={cards} />,
            <StudioCards
              key="studios"
              studios={studioCards(cards)}
              authenticated={Boolean(user)}
            />,
          ]}
        </Tabs>
      </section>
      <section className="share-banner">
        <div>
          <span className="eyebrow">A GOOD PIECE DESERVES ANOTHER OUTING</span>
          <h2>Your closet has possibilities, too.</h2>
          <p>Make room for more stories. Share what you already love.</p>
        </div>
        <GatedActionTrigger
          action="list"
          authenticated={Boolean(user)}
          href="/app/list-a-piece"
          className="button secondary"
        >
          List a piece <Icon name="plus" />
        </GatedActionTrigger>
      </section>
    </div>
  );
}
