import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import { editorData, WorkflowError } from "@/lib/workflow-server";
import { ListingEditor } from "@/components/listing-editor";
import { Gate, Empty } from "@/components/cards";
export const metadata: Metadata = {
  title: "Edit listing",
  robots: { index: false, follow: false },
};
export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await currentUser()))
    return <Gate reason="list a piece" next={"/app/list-a-piece/" + id} />;
  let data;
  try {
    data = await editorData(id);
  } catch (e) {
    if (e instanceof WorkflowError && e.status === 404)
      return (
        <Empty
          title="Not your listing"
          text="You can only edit your own listings."
          href="/app/closet"
          label="My Closet"
        />
      );
    throw e;
  }
  return <ListingEditor {...data} />;
}
