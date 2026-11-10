// P5A: one input check for every Edge Function. A request body must be a JSON object, at most
// [maxBytes], with only the [allowed] fields and every [required] one present. Anything else gets
// HTTP 400 (or 413) with a plain sentence: never the parser's error or any internal detail.

export type InputRule = {
  /** Every field the body may have. Any other field is refused. */
  allowed: readonly string[];
  /** Fields that must be present (not undefined). */
  required?: readonly string[];
  /** Largest body accepted, in bytes. */
  maxBytes: number;
  /** True when an empty body counts as {} (functions that take no input). */
  emptyIsObject?: boolean;
};

export type InputResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: 400 | 413; error: string; message: string };

const BAD = (message: string): InputResult => ({ ok: false, status: 400, error: "bad_request", message });

/** Reads and checks the body. Never throws. */
export async function readInput(req: Request, rule: InputRule): Promise<InputResult> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > rule.maxBytes) {
    return { ok: false, status: 413, error: "too_large", message: "This request is too large." };
  }
  let text: string;
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > rule.maxBytes) {
      return { ok: false, status: 413, error: "too_large", message: "This request is too large." };
    }
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return BAD("This request couldn't be read.");
  }
  if (text.trim() === "") {
    return rule.emptyIsObject ? { ok: true, body: {} } : BAD("Send a JSON object.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return BAD("Send a JSON object.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return BAD("Send a JSON object.");
  }
  const body = parsed as Record<string, unknown>;
  const unknown = Object.keys(body).filter((k) => !rule.allowed.includes(k));
  if (unknown.length > 0) {
    return BAD("This request has fields that aren't accepted.");
  }
  const missing = (rule.required ?? []).filter((k) => body[k] === undefined);
  if (missing.length > 0) {
    return BAD("This request is missing required fields.");
  }
  return { ok: true, body };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
