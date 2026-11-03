"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  workflow,
  dateRange,
  type Profile,
  type OwnListing,
  type InboxData,
} from "@/lib/workflows";
import { price } from "@/lib/types";
import { photoUrl } from "@/lib/supabase/config";
import { Photo } from "./photo";
import { Empty } from "./cards";
import { Icon } from "./icon";
import { WorkflowModal, Notice } from "./workflow-ui";
type ClosetData = {
  profile: Profile;
  listings: OwnListing[];
  inbox: InboxData;
};
export function Closet({ initial }: { initial: ClosetData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState(
    initial.profile.role === "renter" ? "My Rentals" : "My Listings",
  );
  const [sort, setSort] = useState("Newest");
  const [deleting, setDeleting] = useState<OwnListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    workflow<ClosetData>("closet")
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function changeStatus(l: OwnListing) {
    setBusy(true);
    setError("");
    try {
      await workflow("listings/" + l.id + "/status", {
        status: l.status === "active" ? "paused" : "active",
      });
      setData(await workflow<ClosetData>("closet"));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const listings = [...data.listings].sort((a, b) =>
    sort === "Oldest"
      ? a.created_at.localeCompare(b.created_at)
      : sort === "Status"
        ? a.status === b.status
          ? b.created_at.localeCompare(a.created_at)
          : a.status === "active"
            ? -1
            : 1
        : b.created_at.localeCompare(a.created_at),
  );
  const rentals = data.inbox.rentals
    .filter((r) => r.renter_id === data.inbox.me && r.status !== "cancelled")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <div className="page-width workflow-page closet-page">
      <div className="workflow-heading">
        <div>
          <span className="eyebrow accent">YOUR WARDROBE</span>
          <h1>{data.profile.role === "renter" ? "My Rentals" : "My Closet"}</h1>
        </div>
        {data.profile.role !== "renter" && (
          <Link className="button" href="/app/list-a-piece">
            <Icon name="plus" />
            List an item
          </Link>
        )}
      </div>
      {data.profile.role === "both" && (
        <div className="workflow-tabs" role="tablist" aria-label="Closet">
          {["My Listings", "My Rentals"].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <Notice message={error} error />
      {tab === "My Listings" && data.profile.role !== "renter" ? (
        <>
          <div className="closet-toolbar">
            <span>
              {listings.length} {listings.length === 1 ? "piece" : "pieces"}
            </span>
            <label>
              Sort{" "}
              <select
                aria-label="Sort listings"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                {["Newest", "Oldest", "Status"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          {listings.length ? (
            <div className="closet-grid">
              {listings.map((l) => (
                <article className="closet-card" key={l.id}>
                  <Link
                    className="closet-photo"
                    href={"/app/list-a-piece/" + l.id}
                  >
                    <Photo
                      src={photoUrl(l.photos[0]?.storage_path || null)}
                      alt={l.title}
                      sizes="(max-width: 600px) 45vw, 280px"
                    />
                    <span className={"status-badge " + l.status}>
                      {l.status === "active" ? "Active" : "Paused"}
                    </span>
                  </Link>
                  <div className="closet-card-body">
                    <h2>{l.title}</h2>
                    <p className="muted">
                      {l.category} · {l.size_label}
                    </p>
                    <strong>{price(l.price_usd)}</strong>
                    {data.inbox.rentals.some(
                      (r) =>
                        r.listing_id === l.id &&
                        r.status === "active" &&
                        r.lender_id === data.inbox.me,
                    ) && <p className="accent">Rented out</p>}
                    <div className="closet-actions">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void changeStatus(l)}
                      >
                        {l.status === "active" ? "Pause" : "Activate"}
                      </button>
                      <Link
                        className="text-button"
                        href={"/app/list-a-piece/" + l.id}
                      >
                        Edit
                      </Link>
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => setDeleting(l)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Your Closet is Empty"
              text="You haven't listed any clothes yet. Share pieces from your wardrobe."
              href="/app/list-a-piece"
              label="List an item"
            />
          )}
        </>
      ) : rentals.length ? (
        <div className="rental-sections">
          {(["active", "returned"] as const).map((status) => {
            const group = rentals.filter((r) => r.status === status);
            return group.length ? (
              <section key={status}>
                <h2>{status === "active" ? "Active" : "Past"}</h2>
                {group.map((r) => {
                  const c = data.inbox.cards.find(
                    (c) => c.id === r.conversation_id,
                  );
                  return (
                    <Link
                      className="inbox-row"
                      key={r.id}
                      href={"/app/messages/" + r.conversation_id}
                    >
                      <div className="inbox-photo">
                        <Photo
                          src={photoUrl(c?.cover_photo_path || null)}
                          alt={
                            c?.listing_title || "Listing no longer available"
                          }
                          sizes="80px"
                        />
                      </div>
                      <div className="inbox-copy">
                        <strong>
                          {c?.listing_title || "Listing no longer available"}
                        </strong>
                        <p>From {c?.other_name || "Dzirent member"}</p>
                        <span className="muted">
                          {dateRange(r.start_date, r.end_date)}
                        </span>
                      </div>
                      <span className="status-badge">
                        {status === "active" ? "Active" : "Returned"}
                      </span>
                      <Icon name="chevron" />
                    </Link>
                  );
                })}
              </section>
            ) : null;
          })}
        </div>
      ) : (
        <Empty
          title="No active rentals yet"
          text="When you rent something, mark it as rented in the chat and it will show up here."
          href="/"
          label="Browse Home"
        />
      )}
      {deleting && (
        <WorkflowModal
          title="Delete this listing?"
          onClose={() => setDeleting(null)}
          busy={busy}
        >
          <p>
            &quot;{deleting.title}&quot; and its photos will be removed for
            good. Chats about it will be deleted too.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              className="button danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await workflow("listings/" + deleting.id + "/delete", {});
                  setData((old) => ({
                    ...old,
                    listings: old.listings.filter((l) => l.id !== deleting.id),
                  }));
                  setDeleting(null);
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting..." : "Delete"}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
          </div>
        </WorkflowModal>
      )}
    </div>
  );
}
