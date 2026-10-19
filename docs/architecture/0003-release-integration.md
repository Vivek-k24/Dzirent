# ADR 0003: Phase 1 integration and presentation release

Date: 2026-10-18 (America/Chicago). Status: implementation candidate.

The user explicitly instructed Codex to complete the remaining validation, CI, integration and demo
release work after reviewing the four outstanding fixes. This authorizes a scoped integration handoff
covering QA-owned CI/smoke tests and the two reviewed API validation defects. Original role branches
and histories are preserved; this work uses the isolated `codex/release-integration` branch.

Sources: frontend `aa495e1c26307323b9139aa0dafc7c54cfc9e268` (PR #5), independent QA
`f599f56279c28525d6918c5c02593fedbf4438c2` (PR #12), backend
`160ac6142eba8e934bcd64eedbeea58550d84cce` (PR #11). Foundation main is
`2ff5cae77ec165637ae02fade6d4619826760f28`.

Scope: reject invalid measurement/ZIP input before database writes, add regression cases, apply only
the two verified historical test-fixture Gitleaks fingerprints, build before production browser CI,
run real PostgreSQL tests in CI, and update independent API smoke checks for the mounted backend.
No live identity provider, hosted API/database, payment system, or DNS changes are introduced.

The deployed web presentation remains explicit demo mode. Integrated Python code is not a claim of
live UI/provider/database acceptance. Release records will distinguish executed local/CI checks,
deployment smoke evidence and outstanding connected-provider setup.
