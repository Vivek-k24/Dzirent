"use client";
import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import type { StudioProduct } from "./types";
import styles from "./studios.module.css";

const PLACEHOLDER = "/fixtures/garment-placeholder.svg";

// The parent reserves the 3:4 box, so loading or a failed photo never shifts layout.
export function StudioImage({ product, sizes }: { product: StudioProduct; sizes: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.photo}>
    <Image fill className={styles.image} src={failed ? PLACEHOLDER : product.image.url} alt={product.image.alt_text} sizes={sizes}
      onError={() => { if (!failed) setFailed(true); }} />
  </div>;
}

function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    onChange => { const list = window.matchMedia(query); list.addEventListener("change", onChange); return () => list.removeEventListener("change", onChange); },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
export const usePrefersReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)", true);
export const useNarrowViewport = () => useMedia("(max-width: 639px)", false);
