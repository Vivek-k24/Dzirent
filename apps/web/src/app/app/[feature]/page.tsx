import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import {
  readInbox,
  readCloset,
  readSettings,
  editorData,
} from "@/lib/workflow-server";
import { Gate } from "@/components/cards";
import { Inbox } from "@/components/inbox";
import { Closet } from "@/components/closet";
import { Settings } from "@/components/settings";
import { ListingEditor } from "@/components/listing-editor";
export const metadata: Metadata = {
  title: "Your Dzirent",
  robots: { index: false, follow: false },
};
export default async function Feature({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  if (!["messages", "list-a-piece", "closet", "settings"].includes(feature))
    notFound();
  if (!(await currentUser()))
    return (
      <Gate
        reason={
          feature === "messages"
            ? "start a conversation"
            : feature === "list-a-piece"
              ? "list your first piece"
              : "make it personal"
        }
        next={"/app/" + feature}
      />
    );
  switch (feature) {
    case "messages":
      return <Inbox initial={await readInbox()} />;
    case "closet":
      return <Closet initial={await readCloset()} />;
    case "settings":
      return <Settings initial={await readSettings()} />;
    case "list-a-piece":
      return <ListingEditor {...await editorData()} />;
  }
}
