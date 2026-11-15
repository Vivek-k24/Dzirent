// F1: npm test: a listing draft saves unfinished (no size), each step and publishing ask for
// their own fields with the catalog's field-level message, a failed or stalled call shows
// DZ-E9002 and gives the button back, and your own studio offers Edit studio, not Report or Block.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_CATEGORY,
  DRAFT_TITLE,
  activationProblem,
  detailsProblem,
  draftProblem,
  draftRow,
  isUnfinished,
  publishProblem,
  saveDraft,
  sizePriceProblem,
  type ListingForm,
} from "./listing-form.ts";
import { runStep, workflowRequest, WorkflowClientError } from "./requests.ts";
import { isOwnStudio, studioActions } from "./studio-view.ts";

/** What the editor holds on the photos step: nothing typed yet. */
const unfinished: ListingForm = {
  title: "",
  category: "",
  description: "",
  item_type: "",
  garment_type: "top",
  size_label: "",
  price_usd: "",
  price_note: "",
  retail_value: "",
  deposit_note: "",
  listing_styles: [],
  measurements: [],
  availability: [{ start_date: "2026-11-15", end_date: "2026-12-14" }],
  accessory_confirmed: false,
};
const finished: ListingForm = {
  ...unfinished,
  title: "Navy linen blazer",
  category: "Career & Professional",
  size_label: "M",
  price_usd: "25",
};

test("a draft saves with empty size, title, description and item type (the owner's case)", () => {
  assert.equal(draftProblem(unfinished), null);
  const row = draftRow(unfinished);
  assert.equal(row.size_label, null);
  assert.equal(row.price_usd, null, "an empty price is saved empty, never 0");
  assert.equal(row.title, DRAFT_TITLE);
  assert.equal(row.category, DRAFT_CATEGORY);
  assert.equal(row.description, null);
  assert.equal(row.item_type, null);
  // The same with the placeholder title the old page sent.
  assert.equal(draftProblem({ ...unfinished, title: DRAFT_TITLE, category: DRAFT_CATEGORY }), null);
});

test("a draft keeps what is filled in and only refuses what no step accepts", () => {
  const row = draftRow({ ...finished, price_usd: "25.50", description: " Fits true to size " });
  assert.equal(row.title, "Navy linen blazer");
  assert.equal(row.size_label, "M");
  assert.equal(row.price_usd, 25.5);
  assert.equal(row.description, "Fits true to size");
  assert.equal(draftRow({ ...finished, price_usd: "abc" }).price_usd, null, "an unfinished price stays empty");
  assert.deepEqual(draftProblem({ ...unfinished, description: "x".repeat(1001) }), {
    code: "DZ-E2073",
    message: "Description can be up to 1000 characters.",
    field: "description",
  });
});

test("continuing past the details step doesn't ask for the size; it asks for its own fields", () => {
  assert.equal(detailsProblem(finished), null);
  assert.equal(detailsProblem({ ...finished, size_label: "", price_usd: "" }), null);
  assert.deepEqual(detailsProblem(unfinished), { code: "DZ-E2070", message: "Title must be 3 to 80 characters.", field: "title" });
  assert.equal(detailsProblem({ ...finished, category: "" })?.code, "DZ-E2071");
  assert.equal(detailsProblem({ ...finished, category: "Accessories" })?.code, "DZ-E2072");
});

test("continuing past step 3 (publishing) without a size is refused with the size message", () => {
  const problem = publishProblem({ ...finished, size_label: "" });
  assert.deepEqual(problem, { code: "DZ-E2074", message: "Choose a size.", field: "size_label" });
  assert.deepEqual(sizePriceProblem({ ...finished, size_label: "  " }), problem);
  assert.equal(publishProblem(finished), null);
});

test("every other step 3 field has its own catalog message", () => {
  assert.equal(publishProblem({ ...finished, price_usd: "" })?.code, "DZ-E2076");
  assert.equal(publishProblem({ ...finished, price_usd: "0" })?.field, "price_usd");
  assert.equal(publishProblem({ ...finished, garment_type: "" })?.code, "DZ-E2075");
  assert.equal(publishProblem({ ...finished, availability: [] })?.code, "DZ-E2084");
  assert.equal(
    publishProblem({ ...finished, availability: [{ start_date: "2026-12-02", end_date: "2026-12-01" }] })?.code,
    "DZ-E2085",
  );
  assert.equal(publishProblem({ ...finished, measurements: [{ label: "Chest", value: 0, unit: "in" }] })?.code, "DZ-E2083");
  assert.equal(publishProblem({ ...finished, retail_value: "-5" })?.code, "DZ-E2079");
  const accessory = { ...finished, category: "Accessories", item_type: "Tie", garment_type: "one_size", size_label: "One size" };
  assert.equal(publishProblem(accessory)?.code, "DZ-E2081");
  assert.equal(publishProblem({ ...accessory, accessory_confirmed: true, retail_value: "301" })?.code, "DZ-E2080");
  assert.equal(publishProblem({ ...accessory, accessory_confirmed: true }), null);
});

test("a row without a size or price is unfinished, and the closet can't turn it on", () => {
  const draft = { status: "paused", title: DRAFT_TITLE, category: DRAFT_CATEGORY, item_type: null, size_label: null, price_usd: null };
  assert.equal(isUnfinished(draft), true);
  assert.equal(activationProblem(draft)?.code, "DZ-E2070");
  const details = { ...draft, title: "Navy linen blazer", category: "Career & Professional" };
  assert.equal(isUnfinished(details), true, "saved from the details step: still a draft in My closet");
  assert.deepEqual(activationProblem(details), { code: "DZ-E2074", message: "Choose a size.", field: "size_label" });
  assert.equal(activationProblem({ ...details, size_label: "M" })?.code, "DZ-E2076");
  const done = { ...details, size_label: "M", price_usd: 25 };
  assert.equal(isUnfinished(done), false);
  assert.equal(activationProblem(done), null);
  assert.equal(isUnfinished({ ...details, status: "active" }), false, "a live listing is never treated as unfinished");
});

/** A form's busy flag and error line, as the listing editor keeps them. */
function fakeUi() {
  const busy: boolean[] = [];
  let error = "";
  return {
    ui: { setBusy: (b: boolean) => void busy.push(b), setError: (m: string) => void (error = m) },
    busy,
    error: () => error,
  };
}

test("a network failure on the draft save shows DZ-E9002 in place and gives the button back", async () => {
  const sent: unknown[] = [];
  const offline: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    throw new TypeError("Failed to fetch");
  };
  const form = fakeUi();
  const result = await runStep(form.ui, () => saveDraft("00000000-0000-4000-8000-000000000000", unfinished, { fetcher: offline }));
  assert.equal(result, undefined);
  assert.equal(form.error(), "Can't reach the server. Check your internet connection and try again. (DZ-E9002)");
  assert.deepEqual(form.busy, [true, false], "busy while saving, then the button comes back");
  const body = sent[0] as { form: ListingForm & { status: string } };
  assert.equal(body.form.size_label, "", "the draft is sent with its empty size");
  assert.equal(body.form.status, "paused");
});

test("a save that doesn't answer gives up with DZ-E9002 (the 30-second limit, shortened here)", async () => {
  const stalled: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
  const form = fakeUi();
  await runStep(form.ui, () => saveDraft("00000000-0000-4000-8000-000000000000", unfinished, { fetcher: stalled, timeoutMs: 20 }));
  assert.match(form.error(), /\(DZ-E9002\)$/);
  assert.deepEqual(form.busy, [true, false]);
});

test("the server's refusal keeps its words, field and code; a host error page is DZ-E9003", async () => {
  const refusal: typeof fetch = async () =>
    new Response(JSON.stringify({ error: "Choose a size. (DZ-E2074)", field: "size_label", code: "DZ-E2074" }), { status: 400 });
  await assert.rejects(
    workflowRequest("listings/finish", {}, { fetcher: refusal }),
    (e: unknown) => e instanceof WorkflowClientError && e.field === "size_label" && e.code === "DZ-E2074" && e.message === "Choose a size. (DZ-E2074)",
  );
  const gateway: typeof fetch = async () => new Response("<html>504 Gateway Timeout</html>", { status: 504 });
  await assert.rejects(
    workflowRequest("listings/save", {}, { fetcher: gateway }),
    (e: unknown) => e instanceof WorkflowClientError && e.code === "DZ-E9003",
  );
});

test("your own studio offers Edit studio, never Report or Block (or Save)", () => {
  const own = studioActions(isOwnStudio("studiorostova", "StudioRostova "));
  assert.deepEqual(own, { save: false, share: true, report: false, block: false, edit: true });
  const other = studioActions(isOwnStudio("ateliermaya", "studiorostova"));
  assert.deepEqual(other, { save: true, share: true, report: true, block: true, edit: false });
  assert.equal(isOwnStudio(null, "studiorostova"), false, "no handle yet: never your own");
  assert.equal(isOwnStudio("", ""), false);
});
