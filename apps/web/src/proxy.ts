import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import manifest from "../../../fixtures/catalog/manifest.json";
const demoSlugs = new Set(manifest.products.map(p => p.slug));
export function proxy(request: NextRequest) {
  if ((process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo") !== "demo") return NextResponse.next();
  const slug = request.nextUrl.pathname.split("/")[2];
  // Routing only: no catalog lookup, CRUD, identity or ownership implementation.
  // Set the status before streamed UI begins; the adapter supplies all outfit data.
  if (!demoSlugs.has(slug) && !/^demo-created-d3120000-0000-4000-8000-\d{12}$/.test(slug)) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: "/products/:slug" };
