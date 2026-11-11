// C1: automatic retries for reads only, the same rules as the apps (mobile ReadRetry.kt).
// A read that fails on the network or with a 5xx (not 501) or 408 is sent again up to 2 times,
// after 0.5 s and then 2 s. Writes are never sent again: their error shows its code instead.

export const MAX_RETRIES = 2;
const DELAYS_MS = [500, 2000];

/** Database functions that only read: sending them twice changes nothing. */
export const READ_RPCS = new Set([
  "browse_listings", "get_listing", "get_studio", "fit_listings", "search_cities",
  "my_conversations", "my_saved_listings", "my_saved_studios", "my_blocked_users", "my_block_peer_ids",
  "needs_legal_acceptance", "age_blocked", "is_admin", "check_text",
  "admin_queues", "admin_metrics", "admin_cleanup_status", "admin_jobs_status",
]);

/** True for a request that may be sent again: GET or HEAD, or a read-only database function. */
export function isRead(method: string, url: string): boolean {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  if (path.includes("/realtime/")) return false;
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  if (m !== "POST") return false;
  const rpc = /\/rest\/v1\/rpc\/([A-Za-z0-9_]+)\/?$/.exec(path)?.[1];
  return !!rpc && READ_RPCS.has(rpc);
}

export function retryableStatus(status: number): boolean {
  return status === 408 || (status >= 500 && status <= 599 && status !== 501);
}

export function delayMs(retry: number): number {
  return DELAYS_MS[Math.min(Math.max(retry - 1, 0), DELAYS_MS.length - 1)];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with read retries, for the Supabase clients (global.fetch). */
export function retryingFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const method = init?.method ?? request?.method ?? "GET";
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isRead(method, url)) return base(input, init);
    for (let retry = 0; ; retry++) {
      try {
        const response = await base(request ? request.clone() : input, init);
        if (retry >= MAX_RETRIES || !retryableStatus(response.status)) return response;
      } catch (error) {
        if (retry >= MAX_RETRIES || (error as Error)?.name === "AbortError") throw error;
      }
      await sleep(delayMs(retry + 1));
    }
  };
}
