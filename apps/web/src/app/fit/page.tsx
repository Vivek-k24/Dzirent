import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import { context, fit } from "@/lib/data";
import { Gate, Empty, PieceGrid } from "@/components/cards";
export const metadata: Metadata = {
  title: "Likely to fit you",
  robots: { index: false, follow: false },
};
export default async function Fit() {
  if (!(await currentUser()))
    return <Gate action="fit" next="/fit" />;
  const cards = await fit(await context());
  return (
    <div className="page-width saved-page">
      <div className="page-heading">
        <span className="eyebrow accent">PERSONAL TO YOU</span>
        <h1>Likely to fit you.</h1>
        <p>Matched to your private measurements. A good place to start.</p>
      </div>
      {cards.length ? (
        <PieceGrid cards={cards} />
      ) : (
        <Empty
          title="Let’s find your fit"
          text="Add your private measurements to see matching pieces. You can also widen your location or dates."
          href="/app/settings/measurements"
          label="My measurements"
        />
      )}
    </div>
  );
}
