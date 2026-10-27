"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { CategoryTree, Facets, MetroList, References } from "@dzirent/client";
import { api, mode } from "@/lib/api";
import { useBag } from "@/lib/store";

interface Runtime { ready: boolean; error: string; demo: boolean; revision: number }
const RuntimeContext = createContext<Runtime>({ ready: false, error: "", demo: true, revision: 0 });
const ReferenceContext = createContext<{ refs?: References; error: string; retry: () => void }>({ error: "", retry: () => {} });
const MockBootstrap = dynamic(() => import("@/mocks/bootstrap"), { ssr: false });
export const useRuntime = () => useContext(RuntimeContext);
export const useReferences = () => useContext(ReferenceContext);

function ReferenceProvider({ children }: { children: React.ReactNode }) {
  const runtime = useRuntime();
  const categories = useQuery({ queryKey: ["references", "categories", runtime.revision], queryFn: () => api<CategoryTree>("/catalog/categories"), enabled: runtime.ready });
  const facets = useQuery({ queryKey: ["references", "facets", runtime.revision], queryFn: () => api<Facets>("/catalog/facets"), enabled: runtime.ready });
  const locations = useQuery({ queryKey: ["references", "locations", runtime.revision], queryFn: () => api<MetroList>("/locations/metros"), enabled: runtime.ready });
  const refs = categories.data && facets.data && locations.data ? { categories: categories.data.items, facets: facets.data, locations: locations.data } : undefined;
  const error = runtime.error || [categories.error, facets.error, locations.error].find(Boolean)?.message || "";
  return <ReferenceContext.Provider value={{ refs, error, retry: () => { void categories.refetch(); void facets.refetch(); void locations.refetch(); } }}>{children}</ReferenceContext.Provider>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: mode.mode === "connected" } } }));
  const [boot, setBoot] = useState({ ready: false, error: "", revision: 0 });
  useEffect(() => {
    let active = true;
    async function start() {
      // Demo startup owns its hydration so saved sample prices are refreshed before readiness.
      if (mode.mode === "demo") return;
      try {
        await useBag.persist.rehydrate();
        if (mode.mode === "connected" && "serviceWorker" in navigator) {
          const mockControlled = navigator.serviceWorker.controller?.scriptURL.endsWith("/mockServiceWorker.js");
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.filter(r => r.active?.scriptURL.endsWith("/mockServiceWorker.js")).map(r => r.unregister()));
          // An unregistered worker can still control the current document. A fresh
          // navigation releases that controller before any connected API queries.
          if (mockControlled) { window.location.reload(); return; }
        }
        if (active && mode.mode === "connected") setBoot(s => ({ ...s, ready: true }));
      } catch { if (active) setBoot(s => ({ ...s, error: "Client setup failed. Refresh this page to try again.", ready: false })); }
    }
    void start();
    return () => { active = false; };
  }, []);
  const mockReady = useCallback((error: string) => setBoot(s => ({ ...s, ready: !error, error })), []);
  const runtime: Runtime = { ...boot, demo: mode.mode === "demo" };
  return <QueryClientProvider client={client}><RuntimeContext.Provider value={runtime}>{mode.mode === "demo" ? <MockBootstrap onReady={mockReady} /> : null}<ReferenceProvider>{children}</ReferenceProvider></RuntimeContext.Provider></QueryClientProvider>;
}
