import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { context, getListing, isSaved } from "@/lib/data";
import { currentUser, serverClient } from "@/lib/supabase/server";
import { StartChat } from "@/components/start-chat";
import { Distance } from "@/components/distance";
import { listingNotice } from "@/lib/workflows";
import { photoUrl } from "@/lib/supabase/config";
import { Query, value, price, cityLabel } from "@/lib/types";
import { Gallery } from "@/components/photo";
import { Icon } from "@/components/icon";
import { savePiece } from "@/app/actions";
import { GatedActionTrigger } from "@/components/guest-gate";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await context();
  const listing = await getListing(id, ctx.lat, ctx.lng);
  return {
    title: listing?.title || "Piece not found",
    description:
      listing?.description?.slice(0, 160) ||
      "Discover a piece from a local Dzirent studio.",
    openGraph: listing
      ? {
          title: listing.title,
          description: listing.description?.slice(0, 160) || undefined,
          images: listing.photos
            .map((p) => photoUrl(p.storage_path))
            .filter((p): p is string => Boolean(p))
            .slice(0, 1),
        }
      : undefined,
  };
}
const date = (s: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(s + "T12:00:00Z"));
export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ id }, ctx, user, q] = await Promise.all([
    params,
    context(),
    currentUser(),
    searchParams,
  ]);
  const [listing, saved] = await Promise.all([
    getListing(id, ctx.lat, ctx.lng),
    isSaved(id),
  ]);
  if (!listing) notFound();
  const photos = (listing.photos || [])
    .map((p) => photoUrl(p.storage_path))
    .filter((p): p is string => Boolean(p));
  const path = "/listing/" + id;
  const own = user
    ? Boolean(
        (
          await (
            await serverClient()
          )
            .from("listings")
            .select("id")
            .eq("id", id)
            .eq("lender_id", user.id)
            .maybeSingle()
        ).data,
      )
    : false;
  return (
    <div className="page-width listing-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Discover</Link>
        <Icon name="chevron" />
        <Link href={"/search?category=" + encodeURIComponent(listing.category)}>
          {listing.category}
        </Link>
      </nav>
      <div className="listing-layout">
        <Gallery photos={photos} title={listing.title} />
        <section className="listing-summary">
          <span className="eyebrow">{listing.category}</span>
          <h1>{listing.title}</h1>
          <p className="listing-location">
            <Icon name="pin" />
            {cityLabel(listing.city)}{" "}
            <span>
              · <Distance miles={listing.distance} />
            </span>
          </p>
          <div className="listing-price">
            {price(listing.price)}
            <span> / rental</span>
          </div>
          {listing.price_note && <p className="muted">{listing.price_note}</p>}
          <div className="listing-tags">
            {listing.size_label && <span>Size {listing.size_label}</span>}
            {(listing.listing_styles || []).map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <p className="description">
            {listing.description ||
              "A piece ready for its next occasion. Get to know the studio for more details."}
          </p>
          <GatedActionTrigger
            action="studio"
            authenticated={Boolean(user)}
            href={"/studio/" + listing.studio_handle}
            className="studio-byline"
          >
            <span className="avatar">
              {(listing.studio_name || "S").slice(0, 1)}
            </span>
            <span>
              <small>FROM THE CLOSET OF</small>
              <strong>{listing.studio_name || "A local studio"}</strong>
            </span>
            <Icon name="chevron" />
          </GatedActionTrigger>
          <p className="policy-note">{listingNotice}</p>
          {own ? (
            <Link className="button full" href={"/app/list-a-piece/" + id}>
              Edit listing
            </Link>
          ) : user ? (
            <StartChat listingId={id} start={ctx.start} end={ctx.end} />
          ) : (
            <GatedActionTrigger
              action="message"
              authenticated={false}
              className="button full"
            >
              <Icon name="message" />
              Message Lender
            </GatedActionTrigger>
          )}
          {user ? (
            <form action={savePiece}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="saved" value={String(saved)} />
              <input type="hidden" name="next" value={path} />
              <button className="button secondary full">
                <Icon name="bookmark" />
                {saved ? "Saved to your pieces" : "Save this piece"}
              </button>
            </form>
          ) : (
            <GatedActionTrigger
              action="save"
              authenticated={false}
              className="button secondary full"
            >
              <Icon name="bookmark" />
              Save this piece
            </GatedActionTrigger>
          )}
          {value(q, "notice") === "save-error" && (
            <p className="form-message error" role="status">
              Couldn’t update Saved. Please try again.
            </p>
          )}
        </section>
      </div>
      <div className="listing-details">
        <section>
          <h2>Find your fit</h2>
          <p className="muted">Garment measurements, taken by the studio.</p>
          {listing.measurements?.length ? (
            <table className="measurements">
              <tbody>
                {listing.measurements.map((m, i) => (
                  <tr key={m.label + i}>
                    <th scope="row">{m.label}</th>
                    <td>
                      {m.value} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Ask the studio for measurements before making plans.</p>
          )}
          <GatedActionTrigger
            action="fit"
            authenticated={Boolean(user)}
            href="/fit"
            className="text-link accent"
          >
            See what’s likely to fit you <Icon name="arrow" />
          </GatedActionTrigger>
        </section>
        <section>
          <h2>Make a date</h2>
          <p className="muted">Available rental windows</p>
          {listing.availability?.length ? (
            <ul className="availability">
              {listing.availability.map((a, i) => (
                <li key={i}>
                  <Icon name="calendar" />
                  {date(a.start_date)} - {date(a.end_date)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Ask the studio about your dates.</p>
          )}
          <h3>Deposit</h3>
          <p>
            {listing.deposit_note ||
              "Agree on any deposit with the studio before pickup."}
          </p>
          <p className="policy-note">
            For high-value pieces, we recommend that lenders ask for a deposit.
            Rental arrangements are agreed directly between you and the studio.
          </p>
        </section>
      </div>
    </div>
  );
}
