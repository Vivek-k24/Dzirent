import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, photoIssue, sanitizePreviewUrl } from "./photo-upload";

describe("photo upload validation and sanitization", () => {
  it("accepts supported image types within size limit", () => {
    expect(photoIssue({ type: "image/jpeg", size: 100_000 })).toBeNull();
    expect(photoIssue({ type: "image/png", size: 3_999_999 })).toBeNull();
    expect(photoIssue({ type: "image/webp", size: 500 })).toBeNull();
  });

  it("rejects unsupported types and oversized files", () => {
    expect(photoIssue({ type: "image/heic", size: 100_000 })).toContain("HEIC and animations are not supported");
    expect(photoIssue({ type: "image/gif", size: 100_000 })).toContain("HEIC and animations are not supported");
    expect(photoIssue({ type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 })).toContain("no larger than 4 MB");
    expect(photoIssue({ type: "image/jpeg", size: 0 })).toContain("no larger than 4 MB");
  });

  it("sanitizes preview URLs to permit only safe end-anchored blob URLs", () => {
    const validBlob = "blob:http://localhost:3000/12345678-1234-1234-1234-123456789abc";
    const validHttpsBlob = "blob:https://dzirent.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(sanitizePreviewUrl(validBlob)).toBe(validBlob);
    expect(sanitizePreviewUrl(validHttpsBlob)).toBe(validHttpsBlob);
  });

  it("rejects unsafe, non-blob, or injection URLs", () => {
    expect(sanitizePreviewUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizePreviewUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizePreviewUrl("https://malicious.example.com/evil.jpg")).toBeNull();
    expect(sanitizePreviewUrl("blob:http://localhost/<script>")).toBeNull();
    expect(sanitizePreviewUrl("blob:http://localhost/uuid\" onmouseover=\"alert(1)")).toBeNull();
    expect(sanitizePreviewUrl("")).toBeNull();
    expect(sanitizePreviewUrl(null)).toBeNull();
    expect(sanitizePreviewUrl(undefined)).toBeNull();
  });
});

