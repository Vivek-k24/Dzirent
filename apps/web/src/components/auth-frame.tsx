// E1: the frame of the sign-in pages (forgot password, reset, check your email, confirmed): the
// same two columns as the sign-in page, with the page's own card on the right.
import type { ReactNode } from "react";
import { Icon } from "./icon";

export function AuthFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="auth-layout page-width">
      <section className="auth-story">
        <span className="eyebrow">THE NEIGHBORHOOD WARDROBE</span>
        <h1>
          A little more
          <br />
          possibility.
          <br />
          <span>A lot more you.</span>
        </h1>
        <div className="auth-values">
          <div>
            <Icon name="pin" /> Find pieces in your neighborhood
          </div>
          <div>
            <Icon name="bookmark" /> Keep your favorites together
          </div>
        </div>
      </section>
      <section className="auth-card">
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
        {children}
      </section>
    </div>
  );
}
