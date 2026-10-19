import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
export const worker = setupWorker(...handlers);
let started: Promise<unknown> | undefined;
export function startWorker() {
  started ??= worker.start({ quiet: true, serviceWorker: { url: "/mockServiceWorker.js" }, onUnhandledFrame: "bypass" });
  return started;
}
