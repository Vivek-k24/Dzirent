import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@dzirent/client";

const mocks = vi.hoisted(() => ({ api: vi.fn(), clearCsrf: vi.fn() }));
vi.mock("./api", () => ({ ...mocks, mode: { mode: "connected" } }));
import { verifyEmail } from "./auth";
import { useSession } from "./store";

beforeEach(() => { mocks.api.mockReset(); useSession.getState().signOut(); });

describe("explicit email confirmation", () => {
  it("has no verification request merely from loading the module", () => {
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("refreshes existing session truth from the API after confirmation", async () => {
    const notice = { message: "Email verified." };
    mocks.api.mockResolvedValueOnce(notice).mockResolvedValueOnce({
      user: { id: "fixture", display_name: "Fixture", roles: ["renter"], lender_profile: null },
      email_verified: true, synthetic: false, capabilities: [], expires_at: "2030-01-01T00:00:00Z",
    });
    expect(await verifyEmail("private-memory-fixture")).toEqual(notice);
    expect(mocks.api.mock.calls.map(call => call[0])).toEqual(["/auth/email/verify", "/auth/session"]);
    expect(useSession.getState().emailVerified).toBe(true);
    expect(useSession.getState().role).toBe("renter");
    expect(useSession.getState().capabilities).toEqual([]);
  });
  it("leaves rejected links unverified and does not refresh a session", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Expired link"));
    await expect(verifyEmail("private-memory-fixture")).rejects.toThrow("Expired link");
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(useSession.getState().emailVerified).toBe(false);
  });
  it("confirmation without a login leaves the user signed out", async () => {
    mocks.api.mockResolvedValueOnce({ message: "Email verified." }).mockRejectedValueOnce(new ApiError(401, { error: { code: "unauthenticated", message: "Sign in", details: [] }, request_id: "fixture" }));
    await verifyEmail("private-memory-fixture");
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().emailVerified).toBe(false);
  });
  it("fails closed when the post-confirmation session check is unavailable", async () => {
    mocks.api.mockResolvedValueOnce({ message: "Email verified." }).mockRejectedValueOnce(new Error("API unavailable"));
    await verifyEmail("private-memory-fixture");
    expect(useSession.getState().status).toBe("unavailable");
    expect(useSession.getState().emailVerified).toBe(false);
  });
});
