# Candidate .3 — native authentication proposal for owner review

Issue #26 hands auth-specific source/contracts/fixtures to Codex for this Phase 1 PR, serially.
Contract `0.1.0-candidate.3` builds on `.2`. The [draft ADR](../../docs/architecture/0005-native-authentication.md)
records security behavior changes and risks. No claim of acceptance, tested compatibility or deployment.

| Operation | Route under `/api/v1` | Body → result |
| --- | --- | --- |
| getAuthCsrf | GET `/auth/csrf` | → random signed challenge, 30-minute expiry; HttpOnly CSRF cookie |
| registerAccount | POST `/auth/register` | email, display_name, password 12–128 → generic 202; no verified status/session |
| loginAccount | POST `/auth/login` | email, password → AuthSessionRead + rotated HttpOnly session cookie |
| getAuthSession | GET `/auth/session` | → AuthSessionRead or uniform unauthenticated 401 |
| logoutAccount | POST `/auth/logout` | → 204; revoke current session and clear cookies |
| logoutAllSessions | POST `/auth/logout-all` | current_password → 204; revoke all, clear cookies |
| changePassword | POST `/auth/password/change` | current_password, new_password → fresh AuthSessionRead/cookie; other sessions revoked |
| requestEmailVerification | POST `/auth/email/request` | authenticated → generic 202 |
| verifyEmailOwnership | POST `/auth/email/verify` | one-use token → confirmation notice |
| requestPasswordReset | POST `/auth/password/request` | email → generic 202 |
| resetPassword | POST `/auth/password/reset` | one-use token, new_password → notice; all sessions revoked; no auto-login |
| deactivateAccount | POST `/auth/deactivate` | current_password → 204; inactive profile/lender, revoke sessions/links |
| getAdminAccess | GET `/admin/access` | verified narrow operations grant → guard DTO; no dashboard/data |

`AuthSessionRead = {user: CurrentUser, email_verified, synthetic, capabilities, expires_at}`;
capabilities can only contain `operations:access`. It never contains a password, PHC hash, opaque
session token or verification/recovery token. Secret input fields are write-only password-formatted
schemas. Existing error envelope is unchanged, including request IDs and safe field errors.
Additional native errors: 401 `auth_invalid_credentials`/`unauthenticated`; 403
`auth_csrf_failed`, `auth_origin_rejected`, `email_verification_required`,
`reauthentication_required`, `platform_admin_required`; 400 `auth_token_invalid`;
422 `auth_reserved_email`; 429 `auth_rate_limited` + Retry-After; 413/415 and 503 dependency errors.
Registration conflicts return the same generic 202 without replacing credentials.

Transport/security changes for consumers (owner approval pending): connected native uses host-only
cookies; all connected mutations require an exact Origin plus `X-Dzirent-CSRF` from the signed,
session-bound challenge. Demo bearer identity remains only local/test demo. OpenAPI shows both
security alternatives on shared domain endpoints because mode is deployment configuration; they
are never interchangeable at runtime. Native profile/lender writes require verified email. Native
bootstrap returns its existing user. Native DELETE `/me` returns 403 directing the caller to
password-confirmed `/auth/deactivate`. Inactive native sessions are denied, including private reads.
Catalog/product/Studio DTOs, filters, ownership, demo MSW wire shapes and product IDs are unchanged.

OpenAPI/client bindings are generated through `pnpm contracts:generate`, never hand-edited. The
deterministic generator changes catalog metadata to `.3` and adds 13 sanitized denial examples;
credential/token inputs are unusable private-input placeholders at reserved addresses, not seeded
native accounts. Product/reference/image content is unchanged. Phase 2 must align legacy version
assertions and independently exercise successful native workflows with private runtime inputs.
