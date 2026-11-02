import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { readChat, WorkflowError } from "@/lib/workflow-server";
import { context } from "@/lib/data";
import { Chat } from "@/components/chat";
import { Gate } from "@/components/cards";
export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await currentUser()))
    return <Gate reason="start a conversation" next={"/app/messages/" + id} />;
  let data;
  try {
    data = await readChat(id);
  } catch (e) {
    if (e instanceof WorkflowError && e.status === 404) notFound();
    throw e;
  }
  return <Chat initial={data} ctx={await context()} />;
}
