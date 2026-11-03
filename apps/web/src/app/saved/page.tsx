import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import { browse, context, savedStudios } from "@/lib/data";
import { Gate, PieceGrid, StudioCards } from "@/components/cards";
import { Tabs } from "@/components/tabs";
export const metadata: Metadata = {
  title: "Saved",
  robots: { index: false, follow: false },
};
export default async function Saved() {
  const user = await currentUser();
  if (!user) return <Gate action="save" next="/saved" />;
  const ctx = await context();
  const [pieces, studios] = await Promise.all([
    browse(ctx, { saved: "true" }),
    savedStudios(ctx),
  ]);
  return (
    <div className="page-width saved-page">
      <div className="page-heading">
        <span className="eyebrow">GOOD FINDS, KEPT CLOSE</span>
        <h1>Your Saved.</h1>
        <p>Pieces you love. Studios you’ll come back to.</p>
      </div>
      <Tabs labels={["Pieces", "Studios"]}>
        {[
          <PieceGrid key="pieces" cards={pieces} />,
          <StudioCards key="studios" studios={studios} authenticated />,
        ]}
      </Tabs>
    </div>
  );
}
