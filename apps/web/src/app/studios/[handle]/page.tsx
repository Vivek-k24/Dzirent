import { StudioProfile } from "@/components/studios/studio-profile";
export const metadata = { title: "Studio" };
export default async function StudioPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <StudioProfile handle={handle} />;
}
