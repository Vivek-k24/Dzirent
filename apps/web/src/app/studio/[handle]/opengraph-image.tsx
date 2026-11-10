import { photoData, safeDecode, studioPreview } from "@/lib/preview";
import { genericImage, OG_SIZE, OG_TYPE, studioImage } from "@/lib/og";

// P5C: the studio's link preview image, also for guests (the page itself stays behind sign-up).
// Only what the guest shop window shows: studio name, handle, up to 4 listing photos.
export const alt = "A studio on Dzirent";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const studio = await studioPreview(safeDecode(handle));
  if (!studio) return genericImage();
  return studioImage({
    photos: await Promise.all(studio.photos.map((p) => photoData(p))),
    name: studio.name,
    handle: studio.handle,
  });
}
