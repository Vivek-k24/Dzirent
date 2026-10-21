import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 2B: real synthetic PNG bytes go browser -> Next local rewrite -> FastAPI
 * -> Python OpenCV /v1/calibrate-paper. No mocked fetch or fulfilled routes.
 * This is integration evidence, NOT real-photo precision evidence.
 */
const fixtureRoot = resolve(__dirname, "../../test-results/ai-measure");
type Case = {
  file: string;
  approx_corners_px: number[][];
  true_corners_px: number[][] | null;
};
const keys = ["TL", "TR", "BR", "BL"] as const;
const readCases = (): Record<string, Case> =>
  JSON.parse(readFileSync(resolve(fixtureRoot, "paper-snap-cases.json"), "utf8"));

async function upload(page: Page, scene: Case): Promise<Buffer> {
  const photo = readFileSync(resolve(fixtureRoot, scene.file));
  await page.goto("/dev/garment-measure");
  await page.getByTestId("garment-photo-input").setInputFiles({
    name: scene.file, mimeType: "image/png", buffer: photo,
  });
  await expect(page.getByTestId("paper-snap-panel")).toBeVisible();
  for (const [i, key] of keys.entries()) {
    const [x, y] = scene.approx_corners_px[i];
    await page.getByTestId(`corner-${key}-x`).fill(String(x));
    await page.getByTestId(`corner-${key}-y`).fill(String(y));
  }
  return photo;
}

const readCorners = async (page: Page): Promise<number[][]> =>
  Promise.all(keys.map(async key => [
    Number(await page.getByTestId(`corner-${key}-x`).inputValue()),
    Number(await page.getByTestId(`corner-${key}-y`).inputValue()),
  ]));

const paperReply = (page: Page) =>
  page.waitForResponse(res =>
    res.url().includes("/api/v1/dev/paper-calibrate") &&
    res.request().method() === "POST", {timeout: 25_000});

test.describe("Phase 2B / real paper-calibration integration", () => {
  test.skip(process.env.DZIRENT_AIMEASURE_REAL_E2E !== "1",
    "Requires the real local Next, FastAPI, and OpenCV services");
  test.skip(process.env.DZIRENT_PAPER_SNAP_OFFLINE_TEST === "1",
    "Offline scenario runs after deliberately shutting down the Python service");

  test("real perspective paper snaps but never auto-approves; Apply requires explicit confirmation", async ({page}) => {
    const scene = readCases().snapped;
    const image = await upload(page, scene);
    const original = await readCorners(page);
    await expect(page.getByTestId("confirm-paper-button")).toBeDisabled();

    const waiting = paperReply(page);
    await page.getByTestId("calibrate-paper-button").click();
    const response = await waiting;
    expect(response.status(), "The real FastAPI+OpenCV path must return HTTP 200").toBe(200);
    // Playwright may not retain the binary multipart request body in its request
    // snapshot. Confirm the real POST was multipart; successful OpenCV decoding
    // and known-corner recovery below prove the synthetic PNG reached Python.
    const requestHeaders = await response.request().allHeaders();
    expect(requestHeaders["content-type"]).toMatch(/^multipart\/form-data;\s*boundary=/i);
    expect(image.length).toBeGreaterThan(1000);
    const body = await response.json();
    expect(body.schema_version).toBe("paper-calibrate.v0");
    expect(body.detection_status).toBe("snapped");
    expect(body.requires_user_confirmation).toBe(true);
    expect(body.reference_type).toBe("us_letter");
    expect(body.proposed_corners_px).toHaveLength(4);
    expect(scene.true_corners_px).not.toBeNull();

    const errors = body.proposed_corners_px.map((p: number[], i: number) => {
      const truth = scene.true_corners_px![i];
      return Math.hypot(p[0]-truth[0], p[1]-truth[1]);
    });
    expect(Math.max(...errors), "Synthetic known-corner error, in intrinsic pixels").toBeLessThan(2);

    await expect(page.getByTestId("paper-snap-result")).toContainText("Detection: snapped");
    await expect(page.getByTestId("paper-snap-coordinates")).toContainText("TL:");
    expect(await readCorners(page), "No automatic corner mutation").toEqual(original);
    await expect(page.getByTestId("paper-corner-editor")).toBeVisible();

    await page.getByTestId("apply-paper-snap").click();
    const applied = await readCorners(page);
    expect(applied).not.toEqual(original);
    await expect(page.getByTestId("paper-snap-result")).toHaveCount(0);
    await expect(page.getByTestId("confirm-paper-button")).toBeDisabled();
    await expect(page.getByTestId("landmark-editor")).toHaveCount(0);

    await page.getByTestId("us-letter-attestation").check();
    await expect(page.getByTestId("confirm-paper-button")).toBeEnabled();
    await page.getByTestId("confirm-paper-button").click();
    await expect(page.getByTestId("landmark-editor")).toBeVisible();
  });

  test("real snapped response can be discarded without changing reference points", async ({page}) => {
    const scene = readCases().snapped;
    await upload(page, scene);
    const before = await readCorners(page);
    const waiting = paperReply(page);
    await page.getByTestId("calibrate-paper-button").click();
    expect((await (await waiting).json()).detection_status).toBe("snapped");
    await page.getByTestId("dismiss-paper-snap").click();
    expect(await readCorners(page)).toEqual(before);
    await expect(page.getByTestId("paper-snap-result")).toHaveCount(0);
    await expect(page.getByTestId("confirm-paper-button")).toBeDisabled();
  });

  for (const name of ["not_found", "ambiguous"] as const) {
    test(`real OpenCV ${name} keeps manual paper placement available`, async ({page}) => {
      const scene = readCases()[name];
      await upload(page, scene);
      const before = await readCorners(page);
      const waiting = paperReply(page);
      await page.getByTestId("calibrate-paper-button").click();
      const response = await waiting;
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.detection_status).toBe(name);
      expect(result.proposed_corners_px).toBeNull();
      expect(result.calibration_status).toBeNull();
      expect(result.reason_codes).toContain("manual_corners_unchanged");
      await expect(page.getByTestId("paper-snap-result")).toContainText(`Detection: ${name}`);
      await expect(page.getByTestId("apply-paper-snap")).toHaveCount(0);
      expect(await readCorners(page)).toEqual(before);
      await expect(page.getByTestId("paper-corner-editor")).toBeVisible();
    });
  }

  test("invalid quadrilateral is blocked in browser; malformed and oversized requests fail server-side", async ({page, request}) => {
    const scene = readCases().snapped;
    const image = await upload(page, scene);
    await page.getByTestId("corner-TL-x").fill(
      await page.getByTestId("corner-BR-x").inputValue());
    await page.getByTestId("corner-TL-y").fill(
      await page.getByTestId("corner-BR-y").inputValue());
    await expect(page.getByTestId("calibrate-paper-button")).toBeDisabled();

    // These APIRequestContext calls go to the real local FastAPI monolith, not a mock.
    const origin = "http://127.0.0.1:8000/api/v1/dev/paper-calibrate";
    const invalidMedia = await request.post(origin, {
      headers: {"content-type":"application/json"},
      data: JSON.stringify({image:"arbitrary", annotation:"wrong"}),
    });
    expect(invalidMedia.status()).toBe(415);
    const malformed = await request.post(origin, {
      multipart: {
        image: {name:"paper.png",mimeType:"image/png",buffer:image},
        annotation: JSON.stringify({schema_version:"paper-calibrate.v0",
          reference_type:"us_letter",approx_corners_px:[[1,1],[2,2],[3,3]]}),
      },
    });
    expect(malformed.status()).toBe(422);
    const tooBig = await request.post(origin, {
      multipart: {
        image: {name:"overlarge.png", mimeType:"image/png",
          buffer:Buffer.alloc(10 * 1024 * 1024 + 1, 65)},
        annotation: JSON.stringify({schema_version:"paper-calibrate.v0",
          reference_type:"us_letter",approx_corners_px:scene.approx_corners_px}),
      },
    });
    expect(tooBig.status()).toBe(413);
  });
});

test("Phase 2B / real paper service offline returns 503 and keeps manual controls", async ({page}) => {
  test.skip(process.env.DZIRENT_PAPER_SNAP_OFFLINE_TEST !== "1",
    "The runner executes this only after stopping the real Python service");
  const scene = readCases().snapped;
  await upload(page, scene);
  const original = await readCorners(page);
  const waiting = paperReply(page);
  await page.getByTestId("calibrate-paper-button").click();
  expect((await waiting).status()).toBe(503);
  await expect(page.getByTestId("paper-snap-error")).toBeVisible();
  await expect(page.getByTestId("paper-snap-error")).toContainText(/manual|unavailable|offline/i);
  await expect(page.getByTestId("apply-paper-snap")).toHaveCount(0);
  expect(await readCorners(page)).toEqual(original);
  await expect(page.getByTestId("paper-corner-editor")).toBeVisible();
});
