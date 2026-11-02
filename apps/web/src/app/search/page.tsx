import type { Metadata } from "next";
import Link from "next/link";
import { browse, context } from "@/lib/data";
import { Query, value } from "@/lib/types";
import { PieceGrid } from "@/components/cards";
import { FilterButton } from "@/components/shell";
import { Icon } from "@/components/icon";
export const metadata: Metadata = { title: "Discover local pieces" };
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const [q, ctx] = await Promise.all([searchParams, context()]);
  const cards = await browse(ctx, q);
  const term = value(q, "q");
  const row = value(q, "row");
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
            : "Find your next piece.";
  const pageLink = (n: number) => {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v && k !== "page") params.set(k, Array.isArray(v) ? v[0] : v);
    });
    params.set("page", String(n));
    return "/search?" + params.toString();
  };
  return (
    <div className="page-width search-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR NEIGHBORHOOD, WELL DRESSED</span>
        <h1>{title}</h1>
        <p>Good finds from closets around {ctx.city}.</p>
      </div>
      <form action="/search" className="search-form">
        <Icon name="search" />
        <input
          name="q"
          aria-label="Search pieces"
          placeholder="A linen dress, a special occasion, your next look?"
          defaultValue={term}
        />
        {Object.entries(q)
          .filter(([k]) => k !== "q" && k !== "page")
          .map(([k, v]) => (
            <input
              key={k}
              name={k}
              type="hidden"
              value={Array.isArray(v) ? v[0] : v || ""}
            />
          ))}
        <button className="button">Search</button>
      </form>
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
            {cards.length}
            {cards.length === 30 ? "+" : ""} pieces
          </span>
        </div>
        <form action="/search" className="sort-form">
          {Object.entries(q)
            .filter(([k]) => k !== "sort" && k !== "page")
            .map(([k, v]) => (
              <input
                key={k}
                name={k}
                type="hidden"
                value={Array.isArray(v) ? v[0] : v || ""}
              />
            ))}
          <label htmlFor="sort">Sort</label>
          <select
            id="sort"
            name="sort"
            defaultValue={value(q, "sort") || "newest"}
          >
            <option value="newest">Newest first</option>
            <option value="nearest">Nearest first</option>
            <option value="price_low">Price: low to high</option>
            <option value="price_high">Price: high to low</option>
            {term && <option value="relevance">Relevance</option>}
          </select>
          <button className="text-button" aria-label="Apply sort">
            Apply
          </button>
        </form>
      </div>
      <PieceGrid cards={cards} />
      <nav className="pagination" aria-label="Search pages">
        {page > 0 && (
          <Link className="button secondary" href={pageLink(page - 1)}>
            Previous
          </Link>
        )}
        {cards.length === 30 && (
          <Link className="button secondary" href={pageLink(page + 1)}>
            More pieces <Icon name="arrow" />
          </Link>
        )}
      </nav>
    </div>
  );
}
