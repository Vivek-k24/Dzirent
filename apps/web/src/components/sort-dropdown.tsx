"use client";

import { useRouter } from "next/navigation";
import { type Query, value } from "@/lib/types";

export function SortDropdown({
  q,
  term,
  action = "/",
}: {
  q: Query;
  term?: string;
  action?: string;
}) {
  const router = useRouter();
  const currentSort = value(q, "sort") || "newest";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v && k !== "sort" && k !== "page") {
        params.set(k, Array.isArray(v) ? v[0] : v);
      }
    });
    if (val && val !== "newest") {
      params.set("sort", val);
    }
    const qs = params.toString();
    router.push(action + (qs ? "?" + qs : ""));
  }

  return (
    <form action={action} className="sort-form">
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
        defaultValue={currentSort}
        onChange={handleChange}
      >
        <option value="newest">Newest first</option>
        <option value="nearest">Nearest first</option>
        <option value="price_low">Price: low to high</option>
        <option value="price_high">Price: high to low</option>
        {term && <option value="relevance">Relevance</option>}
      </select>
      <noscript>
        <button className="text-button" aria-label="Apply sort">
          Apply
        </button>
      </noscript>
    </form>
  );
}
