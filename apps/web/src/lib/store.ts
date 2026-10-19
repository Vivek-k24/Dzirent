"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cartIssue, rangeError, dateOnly } from "@dzirent/client";
import type { CartLine, CurrentUser, ProductDetail } from "@dzirent/client";

type Notice = { id: number; text: string } | null;
interface SessionState {
  user: CurrentUser | null; role: "renter" | "lender" | null; notice: Notice;
  signIn: (user: CurrentUser, role: "renter" | "lender") => void;
  signOut: () => void; notify: (text: string) => void; dismiss: () => void;
}
let noticeId = 0;
export const useSession = create<SessionState>((set) => ({
  user: null, role: null, notice: null,
  signIn: (user, role) => set({ user, role }), signOut: () => set({ user: null, role: null }),
  notify: text => set({ notice: { id: ++noticeId, text } }), dismiss: () => set({ notice: null }),
}));

interface BagState {
  lines: CartLine[]; wishlist: string[]; location: { metro: string; zip: string };
  add: (p: ProductDetail, size: string, start: string, end: string) => string | null;
  remove: (key: string) => void; toggleSaved: (id: string) => void;
  setLocation: (value: { metro: string; zip: string }) => void; reset: () => void;
}
export const useBag = create<BagState>()(persist((set, get) => ({
  lines: [], wishlist: [], location: { metro: "", zip: "" },
  add: (product, sizeId, start, end) => {
    const error = cartIssue(get().lines, product, sizeId, start, end);
    if (error) return error;
    const key = [product.id, sizeId, start, end].join(":");
    set(s => ({ lines: [...s.lines, { key, product, sizeId, start, end }] }));
    return null;
  },
  remove: key => set(s => ({ lines: s.lines.filter(x => x.key !== key) })),
  toggleSaved: id => set(s => ({ wishlist: s.wishlist.includes(id) ? s.wishlist.filter(x => x !== id) : [...s.wishlist, id] })),
  setLocation: location => set({ location }), reset: () => set({ lines: [], wishlist: [], location: { metro: "", zip: "" } }),
}), {
  name: `dzirent-${process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo"}-preferences-v1`, version: 1,
  storage: createJSONStorage(() => localStorage), skipHydration: true,
  partialize: ({ lines, wishlist, location }) => ({ lines, wishlist, location }),
  merge: (stored, current) => {
    const value = stored as Partial<BagState> | undefined;
    const lines = Array.isArray(value?.lines) ? value.lines.filter(x => x && typeof x.key === "string" && typeof x.product?.id === "string" && Number.isSafeInteger(x.product.rental_price_minor) && x.product.rental_price_minor >= 0 && typeof x.product.brand?.label === "string" && typeof x.product.title === "string" && typeof x.product.slug === "string" && typeof x.product.image?.url === "string" && typeof x.product.size?.label === "string" && typeof x.start === "string" && typeof x.end === "string" && dateOnly(x.start) && dateOnly(x.end) && !rangeError(x.start, x.end)) : [];
    return { ...current, lines, wishlist: Array.isArray(value?.wishlist) ? value.wishlist.filter(x => typeof x === "string") : [],
      location: value?.location && typeof value.location.metro === "string" && typeof value.location.zip === "string" ? value.location : current.location };
  },
}));
