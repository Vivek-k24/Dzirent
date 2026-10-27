"use client";
import { useEffect } from "react";
import { startWorker } from "./browser";
import { seedProducts } from "./fixtures";
import { useBag } from "@/lib/store";

// MSW 3 deliberately has no Node export for msw/browser. The no-SSR boundary
// keeps this browser-only module out of Next's server component graph.
export default function MockBootstrap({ onReady }: { onReady: (error: string) => void }) {
  useEffect(() => {
    let active = true;
    const started = performance.now();
    async function start() {
      await Promise.all([startWorker(), useBag.persist.rehydrate()]);
      if (!active) return;
      useBag.getState().refreshSamplePrices(seedProducts());
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 300 - (performance.now() - started))));
      if (active) onReady("");
    }
    void start().catch(() => { if (active) onReady("The demo service could not start. Refresh this page to try again."); });
    return () => { active = false; };
  }, [onReady]);
  return null;
}
