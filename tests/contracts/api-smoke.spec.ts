import { test, expect } from "@playwright/test";

const API_BASE = process.env.DZIRENT_API_URL || "http://127.0.0.1:8100";
const databaseReady = process.env.DZIRENT_CONTRACT_DB_READY === "1";

test.describe("Independent Contract Verification: Live API Smoke", () => {
  test("GET /api/v1/health/live returns HTTP 200 with status live and contract version", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/health/live`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("live");
    expect(body.contract_version).toBe("0.1.0-candidate.2");
  });

  test("Database readiness reflects the explicitly configured test environment", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/health/ready`);
    expect(res.status()).toBe(databaseReady ? 200 : 503);
    const body = await res.json();
    if (databaseReady) {
      expect(body.status).toBe("ready");
    } else {
      expect(body.error.code).toBe("dependency_unavailable");
      expect(body.request_id).toBeTruthy();
    }
  });

  test("The mounted catalog serves PostgreSQL data or fails closed on database outage", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/catalog/products`);
    expect(res.status()).toBe(databaseReady ? 200 : 503);
    const body = await res.json();
    if (databaseReady) {
      expect(body.total).toBe(40);
      expect(body.items).toHaveLength(40);
      expect(new Set(body.items.map((item: { id: string }) => item.id)).size).toBe(40);
    } else {
      expect(body.error.code).toBe("dependency_unavailable");
    }
  });

  test("GET /api/v1/catalog/products/unknown-outfit-slug returns HTTP 404", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/catalog/products/unknown-outfit-slug`);
    expect(res.status()).toBe(databaseReady ? 404 : 503);
  });

  test("Non-existent route returns 404", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/nonexistent-route-check`);
    expect(res.status()).toBe(404);
  });
});

