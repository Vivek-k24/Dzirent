import { describe, expect, it } from "vitest";
import { photoQualityLocalAllowed } from "./access";

describe("AI-quality developer route authorization", () => {
  it("accepts explicitly local/test environments outside hosting", () => {
    expect(photoQualityLocalAllowed("local", "production", undefined)).toBe(true);
    expect(photoQualityLocalAllowed("test", "production", undefined)).toBe(true);
    expect(photoQualityLocalAllowed(undefined, "development", undefined)).toBe(true);
  });
  it("rejects production, staging, Vercel preview and Vercel production", () => {
    expect(photoQualityLocalAllowed("production", "development", undefined)).toBe(false);
    expect(photoQualityLocalAllowed("staging", "development", undefined)).toBe(false);
    expect(photoQualityLocalAllowed(undefined, "production", undefined)).toBe(false);
    expect(photoQualityLocalAllowed("test", "production", "preview")).toBe(false);
    expect(photoQualityLocalAllowed("local", "production", "production")).toBe(false);
  });
});
