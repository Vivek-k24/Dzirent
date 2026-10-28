import type { components, ProductDetail } from "@dzirent/client";
import { api, mode } from "./api";

type UploadIntent = components["schemas"]["UploadIntent"];
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTO_BYTES = 4_000_000;
const BLOB_URL_PATTERN = /^blob:https?:\/\/[A-Za-z0-9.:-]+\/[A-Za-z0-9-]+$/;

export function sanitizePreviewUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (BLOB_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function photoIssue(file: Pick<File, "size" | "type">): string | null {
  if (!photoTypes.has(file.type)) return "Export your photo as JPEG, PNG or WebP; HEIC and animations are not supported.";
  if (!file.size || file.size > MAX_PHOTO_BYTES) return "Choose a photo no larger than 4 MB. Export a smaller copy if needed.";
  return null;
}

export async function uploadPhoto(product: ProductDetail, file: File, altText: string, rights: boolean): Promise<ProductDetail> {
  if (mode.mode !== "connected") throw new Error("Personal photo uploads are available only through the connected API.");
  const issue = photoIssue(file);
  if (issue) throw new Error(issue);
  if (!rights) throw new Error("Confirm your photo rights and any identifiable person's consent.");
  const base = `/lender/products/${encodeURIComponent(product.id)}/images`;
  const intent = await api<UploadIntent>(`${base}/upload-intent`, { method: "POST", protected: true, body: JSON.stringify({ filename: "garment-photo", content_type: file.type, size_bytes: file.size, rights_confirmed: true }) });
  const path = `${base}/uploads/${encodeURIComponent(intent.upload_id)}`;
  const target = new URL(intent.upload_url, window.location.origin);
  if (target.origin !== window.location.origin || target.pathname !== `/auth/api${path}` || target.search || target.hash || target.username || target.password || intent.method !== "PUT") throw new Error("The photo upload address was rejected. Please contact support.");
  if (file.size > intent.max_size_bytes || Date.parse(intent.expires_at) <= Date.now()) throw new Error("This upload expired or has a smaller file limit. Select the photo again.");
  await api(path, { method: "PUT", protected: true, headers: { "Content-Type": file.type }, body: file });
  return api<ProductDetail>(`${base}/complete`, { method: "POST", protected: true, body: JSON.stringify({ upload_id: intent.upload_id, alt_text: altText.trim(), expected_version: product.version }) });
}
