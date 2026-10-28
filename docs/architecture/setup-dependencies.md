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
| First-party FastAPI authentication | Real connected identity | Implement Argon2id password hashes, verified email ownership, revocable sessions and reset flows under Issue #26. No managed identity provider, and no sample identity in connected mode. |
| Azure PostgreSQL 17 staging | Hosted connected persistence | Owner has provisioned PostgreSQL 17.11 in North Central US with separate migrator/runtime roles, verified TLS and schema head 0002_studios. No additional database creation. |
| Vercel project + GitHub link | Phase 1A hosted preview | An attached GitHub integration was observed through a failed automatic deployment check. Root/web-app guards disable automatic Git deployments. Provider settings/credentials remain unverified; a later authorized release needs `apps/web` root, workspace build, explicit demo mode and deliberate preview access. No project was created/configured by bootstrap. |
| Azure HTTPS API hosting | Hosted FastAPI | Pending Issue #25: choose a bounded-cost runtime, protect credentials, configure exact CORS, serialize migrations and test readiness. |
| AWS S3 / CloudFront | Connected media milestone | Scoped upload permissions, CORS, public catalog derivatives separated from private future evidence. No credentials or buckets needed for placeholders/MSW. |
| Sentry | Later connected observability | Project/DSN and redaction rules when enabled. Phase 0 does not fabricate a DSN or send telemetry. |
| Expo/EAS + store accounts/devices | Phase 2 native | EAS project; Apple/Google accounts/certificates and Android/iOS devices or simulators. None are prerequisites for web presentation. |
| DNS access | Later approved custom domain release | Confirm authoritative DNS provider and exact provider-supplied records. No DNS query/change or domain attachment performed in bootstrap. |

For connected local configuration, fill the two ignored env files from their examples. Web requires
`NEXT_PUBLIC_DZIRENT_MODE=connected`, server-only `DZIRENT_API_UPSTREAM_URL` ending `/api/v1`, and
exact `DZIRENT_WEB_ORIGIN`. API requires `DZIRENT_MODE=connected`, `DZIRENT_IDENTITY_MODE=native`,
PostgreSQL URL, private `DZIRENT_AUTH_CSRF_KEY` and matching exact `DZIRENT_AUTH_WEB_ORIGIN`.
Issue #26 Phase 1 source is untested and not released; missing configuration fails closed.
Do not start staging, migrate or provision accounts before the separate owner-approved Phase 2.
Do not use the staging database as a disposable test database. Refer to Issue #25 for Azure infrastructure.
