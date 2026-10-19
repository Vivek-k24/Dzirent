import { test, expect } from "@playwright/test";

const API_BASE = process.env.DZIRENT_API_URL || "http://127.0.0.1:8100";

test.describe("Independent Contract Verification: Live API Smoke", () => {
  test("GET /api/v1/health/live returns HTTP 200 with status live and contract version", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/health/live`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("live");
    expect(body.contract_version).toBe("0.1.0-candidate.1");
  });

  test("GET /api/v1/health/ready returns HTTP 503 in Phase 0 (fail-closed readiness)", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/health/ready`);
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("foundation_not_connected");
    expect(body.error.message).toContain("Database readiness is not implemented in Phase 0");
    expect(body.request_id).toBeDefined();
  });

  test("GET /api/v1/catalog/products returns HTTP 404 (schema-only router unmounted)", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/catalog/products`);
    expect(res.status()).toBe(404);
  });

  test("Non-existent route returns 404", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/nonexistent-route-check`);
    expect(res.status()).toBe(404);
  });
});

