import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), clearCsrf: vi.fn() }));
vi.mock("./api", () => ({ ...mocks, mode: { mode: "connected" } }));
import { registerAndLogin } from "./auth";
import { useSession } from "./store";

beforeEach(() => { mocks.api.mockReset(); useSession.getState().signOut(); });

describe("committed registration followed by native login", () => {
  const input = { email: "local@fixture.invalid", password: "local-unit-input-only", display_name: "Local fixture" };
  it("waits for generic registration and returns only the normal login session", async () => {
    let commit: () => void = () => {};
    mocks.api.mockReturnValueOnce(new Promise(resolve => { commit = () => resolve({ message: "Accepted" }); }));
    const session = { email_verified: false, synthetic: false, capabilities: [], user: { roles: ["renter"] } };
    mocks.api.mockResolvedValueOnce(session);
    const pending = registerAndLogin(input);
    expect(mocks.api.mock.calls.map(call => call[0])).toEqual(["/auth/register"]);
    expect(useSession.getState().user).toBeNull();
    commit();
    expect(await pending).toBe(session);
    expect(mocks.api.mock.calls.map(call => call[0])).toEqual(["/auth/register", "/auth/login"]);
    expect(JSON.parse(mocks.api.mock.calls[1][1].body)).toEqual({ email: input.email, password: input.password });
    expect(useSession.getState().user).toBeNull(); // Only the caller may accept the real login result.
  });
  it("never logs in after a failed registration transaction", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(registerAndLogin(input)).rejects.toThrow("Unavailable");
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(useSession.getState().user).toBeNull();
  });
  it("does not manufacture a session from a duplicate/accepted registration notice", async () => {
    mocks.api.mockResolvedValueOnce({ message: "Accepted" }).mockRejectedValueOnce(new Error("Sign in failed"));
    await expect(registerAndLogin(input)).rejects.toThrow("Sign in failed");
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().emailVerified).toBe(false);
  });
});
