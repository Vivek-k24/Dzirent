# 0002: Phase 1A web candidate

Status: implemented candidate; foundation and web review remain required.
Base: `37957823213cd2b25e980edad5058becdf9a7fbb`; contract `0.1.0-candidate.1` unchanged.

Next owns routing/presentation. `packages/client` supplies typed HTTP transport and pure URL/date/cart
helpers. Query owns API cache; the URL owns filters/sort/view/page. Next's documented native history
integration updates PLP controls without an extra server navigation. Other pages use router navigation.
Zustand stores memory-only sample identity plus versioned bag/wishlist/location preferences; no tokens/passwords.

MSW consumes canonical fixtures through the same `/api/v1` wire format. Its local owner checks and
versioned mutations simulate the future API; they are not an alternative connected backend. MSW 3's
browser-only export loads behind a no-SSR boundary. Providers sit within the same hydration boundary
as the shell so references cannot change navigation before WebKit hydrates. Connected mode never starts
MSW and releases any old mock-worker controller before issuing connected queries.

Images overlay canonical image IDs in web-owned media metadata. Forty local licensed JPEGs and two OFL
fonts remove runtime image/font provider dependencies. The photos are explicitly illustrative. Canonical
contracts/fixtures/generated types are untouched. Demo route existence uses an immutable slug set and a
reserved mock-created UUID namespace in `src/proxy.ts`; unknown slugs rewrite to Next's HTTP 404 page
before streamed UI starts. This performs no catalog search, authorization, ownership or CRUD.

The initial presentation shows eight visible skeletons for at least 300 ms; one catalog request returns
the original forty products. Later queries retain/fade the current results for at most the 150 ms CSS
transition. Connected pagination uses accessible Load more and URL page history. Static category counts
are never summed across secondary memberships.

Compatible exception: the user's explicit role activation permits this candidate while foundation PR #1
is still open; it does not authorize merging it or launching other roles. No approved external PR has been
integrated. Occasion/Fabric are read-only menu metadata because the frozen API has no matching filters.
[Contract request #4](https://github.com/Vivek-k24/Dzirent/issues/4) proposes the smallest optional extension
for Claude's review. Do not substitute search semantics or edit the frozen contract independently.

The immutable presentation tag will remain stable during later Phase 1B adapter/provider integration.
No deployment, native app, payment, payout, reservation, worker or business policy was added.
