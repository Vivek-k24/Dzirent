# Setup dependencies by milestone

Provider credentials were neither requested nor read in bootstrap. A provider's configuration/account
availability is **unverified**, rather than assumed absent. These are concrete future setup dependencies;
they do not block local fixtures/MSW or the foundation shell.

| Dependency | Needed for | Concrete setup / owner |
| --- | --- | --- |
| GitHub | Shared PR workflow | User supplied `Vivek-k24/Dzirent`; gh active account has ADMIN access. Preserve concurrent user-created main as PR base. Add actual reviewer/collaborator accounts and enable required checks/owner reviews. Independent lane names are not GitHub identities. |
| Node/pnpm/Python/uv | Fresh clone startup | Install matrix versions; `pnpm install --frozen-lockfile`, `pnpm api:sync`. Checkout-local `.tools/` is not shared through Git. |
| Curated fashion media | Phase 1A presentation | Codex obtains approved/licensed garment photos, records source/license and 3:4 derivatives. Bootstrap supplies a locally authored fallback only. No scraping/search API needed. |
| Local PostgreSQL | Phase 1B local integration | Docker Compose, dev DB `dzirent_dev` at 5432; separate disposable QA project at 55432 / `dzirent_qa`. Claude supplies migration head and restricted idempotent seed command. |
| Clerk development instance | Real connected identity | Configure exact app origins/redirects and provider password/step policy; publishable key for clients, API issuer/authorized parties and official Python verification SDK. No second password store. Do not accept sample identity as real auth. |
| Neon staging project | Hosted connected persistence | Dedicated dev/staging PostgreSQL, least-privilege TLS runtime URL and direct migration URL as needed; backup/restore settings and rehearsal. Claude designs config; creation requires later authorization. |
| Vercel project + GitHub link | Phase 1A hosted preview | An attached GitHub integration was observed through a failed automatic deployment check. Root/web-app guards disable automatic Git deployments. Provider settings/credentials remain unverified; a later authorized release needs `apps/web` root, workspace build, explicit demo mode and deliberate preview access. No project was created/configured by bootstrap. |
| Render service | Hosted FastAPI | Docker runtime, secret storage, exact CORS, serialized migrations, readiness and rollback. Not created in Phase 0. |
| AWS S3 / CloudFront | Connected media milestone | Scoped upload permissions, CORS, public catalog derivatives separated from private future evidence. No credentials or buckets needed for placeholders/MSW. |
| Sentry | Later connected observability | Project/DSN and redaction rules when enabled. Phase 0 does not fabricate a DSN or send telemetry. |
| Expo/EAS + store accounts/devices | Phase 2 native | EAS project; Apple/Google accounts/certificates and Android/iOS devices or simulators. None are prerequisites for web presentation. |
| DNS access | Later approved custom domain release | Confirm authoritative DNS provider and exact provider-supplied records. No DNS query/change or domain attachment performed in bootstrap. |

For connected local configuration, fill the two ignored env files from their examples. Web requires
`NEXT_PUBLIC_DZIRENT_MODE=connected`, API base ending `/api/v1`, and a real Clerk publishable key.
API requires `DZIRENT_MODE=connected`, `DZIRENT_IDENTITY_MODE=clerk`, database URL, issuer,
authorized parties, and exact CORS origins. Guards reject missing configuration, but satisfying guards
does **not** implement token verification or database readiness. Those are Claude's Phase 1B tasks.
