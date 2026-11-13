import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { context, studio } from "@/lib/data";
import { currentUser } from "@/lib/supabase/server";
import { cityLabel, Query, value } from "@/lib/types";
import { Gate, PieceGrid } from "@/components/cards";
import { Icon } from "@/components/icon";
import { studioAction } from "@/app/actions";
import { ConfirmSubmit } from "@/components/submit";
import { refusalText } from "@/lib/refusals";
import { safeDecode, studioPreview } from "@/lib/preview";
import { studioLink, studioShareText } from "@/lib/share";
import { ShareButton } from "@/components/share-button";
// P5C: preview tags for everyone, guests and link-preview bots included, from the guest shop
// window only (studio name, handle, up to 4 listing photos in the opengraph-image). The page
// itself still asks guests to sign up.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const handle = safeDecode((await params).handle);
  const preview = await studioPreview(handle);
  const robots = { index: false, follow: false };
  if (!preview) {
    return {
      title: "Meet the studio",
      robots,
      openGraph: { title: "A studio on Dzirent", description: "Rent clothes from closets near you.", siteName: "Dzirent", type: "website" },
      twitter: { card: "summary_large_image", title: "A studio on Dzirent" },
    };
  }
  const title = `${preview.name} (@${preview.handle})`;
  const description = `Pieces to rent from @${preview.handle} on Dzirent.`;
  const url = studioLink(preview.handle);
  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Dzirent", type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}
export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ handle }, ctx, user, q] = await Promise.all([
    params,
    context(),
    currentUser(),
    searchParams,
  ]);
  if (!user) return <Gate action="studio" next={"/studio/" + handle} />;
  const s = await studio(handle, ctx);
  if (!s) notFound();
  return (
    <div className="page-width studio-page">
      <section className="studio-header">
        <div className="large-avatar">{s.studio_name.slice(0, 1)}</div>
        <div className="studio-bio">
          <span className="eyebrow">YOUR NEIGHBORHOOD, IN GOOD TASTE</span>
          <h1>{s.studio_name}</h1>
          <p className="muted">
            @{s.studio_handle} <span>·</span> {cityLabel(s.city)}
          </p>
          <p>{s.studio_bio || "Good pieces, shared from a local closet."}</p>
          <div className="listing-tags">
            {s.style_tags?.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
        <form action={studioAction}>
          <input type="hidden" name="handle" value={handle} />
          <input
            type="hidden"
            name="action"
            value={s.is_saved ? "unsave" : "save"}
          />
          <button className="button secondary">
            <Icon name="bookmark" />
            {s.is_saved ? "Studio saved" : "Save studio"}
          </button>
        </form>
        <div className="studio-share">
          <ShareButton
            text={studioShareText(s.studio_name, s.studio_handle)}
            link={studioLink(s.studio_handle)}
          />
        </div>
      </section>
      <div className="studio-stats">
        <div>
          <span>THE NEIGHBORHOOD</span>
          <strong>{cityLabel(s.city)}</strong>
        </div>
        <div>
          <span>RENTALS</span>
          <strong>{s.rental_count || 0}</strong>
        </div>
        <div>
          <span>TYPICAL REPLY</span>
          <strong>
            {s.reply_minutes == null
              ? "Getting started"
              : s.reply_minutes < 60
                ? "Within an hour"
                : Math.round(s.reply_minutes / 60) + " hours"}
          </strong>
        </div>
        {s.pickup_area && (
          <div>
            <span>PICKUP AREA</span>
            <strong>{s.pickup_area}</strong>
          </div>
        )}
      </div>
      {value(q, "notice") === "reported" && (
        <p className="notice" role="status">
          Thank you. Your report has been submitted.
        </p>
      )}
      {value(q, "notice") === "action-error" && (
        <p className="notice" role="status">
          That didn’t go through. Please try again.
        </p>
      )}
      {refusalText(value(q, "notice")) && (
        <p className="notice" role="status">
          {refusalText(value(q, "notice"))}
        </p>
      )}
      <div className="section-heading">
        <h2>Inside the closet</h2>
        <span className="muted">{s.listings?.length || 0} pieces</span>
      </div>
      <PieceGrid cards={s.listings || []} />
      <details className="studio-safety">
        <summary>Studio options</summary>
        <div className="safety-options">
          <form action={studioAction}>
            <h3>Report this studio</h3>
            <input type="hidden" name="handle" value={handle} />
            <input type="hidden" name="action" value="report" />
            <label className="field">
              <span>Reason</span>
              <select name="reason" required data-required-message="Choose a reason for the report.">
                <option value="">Choose a reason</option>
                <option>Inappropriate content</option>
                <option>Misleading listing</option>
                <option>Harassment</option>
                <option>Other</option>
              </select>
            </label>
            <label className="field">
              <span>Details (optional)</span>
              <textarea name="details" maxLength={500} rows={3} />
            </label>
            <ConfirmSubmit
              label="Submit report"
              title="Report this studio?"
              message="Someone at Dzirent will review this studio. The studio isn't told who reported it."
            />
          </form>
          <form action={studioAction}>
            <h3>Block this studio</h3>
            <p>
              Their pieces and studio will disappear from your browsing, and
              yours from theirs.
            </p>
            <input type="hidden" name="handle" value={handle} />
            <input type="hidden" name="action" value="block" />
            <ConfirmSubmit
              label="Block studio"
              title="Block this studio?"
              message="Their pieces will disappear from your browsing, and yours from theirs."
            />
          </form>
        </div>
      </details>
    </div>
  );
}
