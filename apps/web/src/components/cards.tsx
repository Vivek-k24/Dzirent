import Link from "next/link";
import { Card, StudioCardData, price, cityLabel } from "@/lib/types";
import { photoUrl } from "@/lib/supabase/config";
import { Photo } from "./photo";
import { Icon } from "./icon";
import { Distance } from "./distance";
import {
  GatedActionTrigger,
  GATED_ACTIONS,
  type GatedActionKey,
} from "./guest-gate";
export function PieceCard({
  card,
  priority = false,
}: {
  card: Card;
  priority?: boolean;
}) {
  return (
    <Link className="piece-card" href={"/listing/" + card.id}>
      <div className="piece-image">
        <Photo
          src={photoUrl(card.cover_photo_path)}
          alt={card.title}
          priority={priority}
        />
      </div>
      <h3>{card.title}</h3>
      <p>
        {price(card.price)} <span aria-hidden="true">·</span>{" "}
        <Distance miles={card.distance} />
      </p>
    </Link>
  );
}
export function PieceGrid({ cards }: { cards: Card[] }) {
  return cards.length ? (
    <div className="piece-grid">
      {cards.map((c) => (
        <PieceCard key={c.id} card={c} />
      ))}
    </div>
  ) : (
    <Empty
      title="Nothing here just yet"
      text="Try a different date range or a wider search. Your next favorite piece could be close by."
      href="/"
      label="Explore pieces"
    />
  );
}
export function StudioCards({
  studios,
  authenticated,
}: {
  studios: StudioCardData[];
  authenticated: boolean;
}) {
  return studios.length ? (
    <div className="studio-grid">
      {studios.map((s) => (
        <GatedActionTrigger
          key={s.studio_handle}
          action="studio"
          authenticated={authenticated}
          href={"/studio/" + s.studio_handle}
          className="studio-card"
        >
          <div className="studio-image">
            <Photo
              src={photoUrl(s.cover_photo_path)}
              alt={"Pieces from " + s.studio_name}
            />
            <span className="studio-avatar">
              {s.studio_name.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <h3>{s.studio_name}</h3>
          <p>{cityLabel(s.city)}</p>
          <span className="text-link">
            Visit studio <Icon name="arrow" />
          </span>
        </GatedActionTrigger>
      ))}
    </div>
  ) : (
    <Empty
      title="Your studios, together"
      text="Save a studio you love and find its pieces here next time."
      href="/?tab=studios"
      label="Discover studios"
    />
  );
}
export function Empty({
  title,
  text,
  href,
  label,
}: {
  title: string;
  text: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name="hanger" />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {href && (
        <Link className="button" href={href}>
          {label || "Browse pieces"} <Icon name="arrow" />
        </Link>
      )}
    </div>
  );
}
export function Gate({
  reason = "make it yours",
  action,
  next = "/",
}: {
  reason?: string;
  action?: GatedActionKey;
  next?: string;
}) {
  const info = action ? GATED_ACTIONS[action] : null;
  const title = info ? info.title : "Sign up to " + reason + ".";
  const message = info
    ? info.message
    : "Save the pieces you love, get to know local studios, and find a fit that feels like you.";

  return (
    <section className="gate-panel">
      <div className="eyebrow">A LITTLE MORE PERSONAL</div>
      <Icon name="bookmark" className="gate-icon" />
      <h1>{title}</h1>
      <p>{message}</p>
      <div className="button-row">
        <Link
          className="button"
          href={"/auth?mode=signup&next=" + encodeURIComponent(next)}
        >
          Create account <Icon name="arrow" />
        </Link>
        <Link
          className="button secondary"
          href={"/auth?mode=signin&next=" + encodeURIComponent(next)}
        >
          Sign in
        </Link>
      </div>
      <Link className="muted-link" href="/">
        Not now
      </Link>
    </section>
  );
}
