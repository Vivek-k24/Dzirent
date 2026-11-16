// F1: calls from a page to the website's server (/api/workflows) never leave a form waiting.
// Every call gives up after REQUEST_TIMEOUT_MS; no answer, a dropped connection or the time
// running out is DZ-E9002, and an answer that isn't the server's JSON (a host error page) is
// DZ-E9003 for a 5xx, else DZ-E9999. The .ts extensions let `npm test` load this file as it is.
import { errorText, shown } from "./errors.ts";

/** How long a page waits for the server before it gives up (the apps use the same limit). */
export const REQUEST_TIMEOUT_MS = 30_000;

/** A refusal or failure as the page shows it: the words with the code, the field, the code. */
export class WorkflowClientError extends Error {
  field?: string;
  /** C1/C6: the catalog code, e.g. DZ-E6001 (verify your ID first). */
  code?: string;
  constructor(message: string, field?: string, code?: string) {
    super(message);
    this.name = "WorkflowClientError";
    this.field = field;
    this.code = code;
  }
}

/** The catalog's words for [code] as a WorkflowClientError. */
export function codedClientError(code: string): WorkflowClientError {
  const error = shown(code);
  return new WorkflowClientError(errorText(error), error.field, error.code);
}

export type RequestOptions = {
  /** For tests: stands in for fetch. */
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const isAbort = (error: unknown) => (error as { name?: string } | null)?.name === "AbortError";

/**
 * Sends the request and reads its answer with [read], both within the time limit. Only a
 * WorkflowClientError ever comes out: [read]'s own, or DZ-E9002 when no answer arrived in time.
 */
export async function timedRequest<T>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(url, { ...init, signal: controller.signal });
    return await read(response);
  } catch (error) {
    if (error instanceof WorkflowClientError) throw error;
    // fetch rejects only without an answer: offline, a dropped connection, or the time limit.
    throw codedClientError("DZ-E9002");
  } finally {
    clearTimeout(timer);
  }
}

type Refusal = { error?: unknown; field?: unknown; code?: unknown };

/** The server's JSON answer, or its refusal ({ error, field, code }) as a WorkflowClientError. */
export async function readAnswer<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbort(error)) throw error; // the time ran out while reading: DZ-E9002
    throw codedClientError(response.status >= 500 ? "DZ-E9003" : "DZ-E9999");
  }
  if (!response.ok) {
    const refusal = (body ?? {}) as Refusal;
    throw new WorkflowClientError(
      typeof refusal.error === "string" && refusal.error ? refusal.error : errorText(shown("DZ-E9999")),
      typeof refusal.field === "string" ? refusal.field : undefined,
      typeof refusal.code === "string" ? refusal.code : undefined,
    );
  }
  return body as T;
}

/** A JSON call to /api/workflows/[path]: GET without [body], POST with it. */
export function workflowRequest<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return timedRequest(
    "/api/workflows/" + path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    },
    (response) => readAnswer<T>(response),
    options,
  );
}

/** A multipart upload to /api/workflows/[path] (listing and condition photos). */
export function workflowUpload<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
  return timedRequest("/api/workflows/" + path, { method: "POST", body: form }, (response) => readAnswer<T>(response), options);
}

/** What a form shows while a step runs: busy (buttons off, "Saving...") and the error line. */
export type StepUi = {
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
};

/** The words to show for any failure: a WorkflowClientError's own (with its code), else DZ-E9999. */
export function failureText(error: unknown): string {
  if (error instanceof WorkflowClientError && error.message) return error.message;
  return errorText(shown("DZ-E9999"));
}

/**
 * Runs one step that waits on the server: busy while it runs, then, whatever happens, busy off
 * again, and on a failure its message shown in place (the result is undefined then). [onError]
 * sees the failure first (a field's message, going back a step).
 */
export async function runStep<T>(
  ui: StepUi,
  step: () => Promise<T>,
  onError?: (error: unknown) => void,
): Promise<T | undefined> {
  ui.setBusy(true);
  ui.setError("");
  try {
    return await step();
  } catch (error) {
    onError?.(error);
    ui.setError(failureText(error));
    return undefined;
  } finally {
    ui.setBusy(false);
  }
}
