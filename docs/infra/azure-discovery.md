# Azure discovery and conditional setup plan

Owner: Codex; [AZ-DISC issue #23](https://github.com/Vivek-k24/Dzirent/issues/23).
Branch `codex/azure-discovery`, exact start `9581874f0653e2ecfae278472a84bcca775e632a`.
Discovery date: **2026-10-19, America/Chicago**. This is read-only setup evidence, not authorization
or a provisioning result. **Provisioning remains blocked. No Azure resources were created/changed.**

## Verified observations

Authentication actually used **VisualStudioCodeCredential**, silently reusing the existing Azure
Resources account through `azure-identity-broker`. No CLI fallback, browser/device-code login or
pasted credential was needed. The installed Azure Resources extension is 0.13.2. No credential
cache, access token, password, storage key or HTTP authorization header was copied to the repository.

The first ARM request confirmed exact subscription **`c4de17fc-7a0d-4376-8758-ba2b4f79b7c6`**, state
**Enabled**, and a valid tenant UUID equal to the accepted token's tenant. The tenant is represented
in this committed report by SHA256 prefix **`5e8e56408505`**; its full UUID stays in ignored local
ARM evidence. Subscription policy `quotaId` is **`AzureForStudents_2018-01-01`**, spending limit
**On**. Those fields establish the reported offer category/guard; they do not verify current benefit
eligibility, enrollment expiry, remaining credit, service allowances or spending availability.

| Discovery section | Actual result | Meaning / boundary |
| --- | --- | --- |
| Resource groups | Complete list: 1, with 0 Dzirent matches | Matching searches name/id/tag values and related group membership. An unlabeled group's ownership is unknown; review its local inventory before proposing a new group. |
| PostgreSQL Flexible Servers | Complete list: 0 | No existing PostgreSQL Flexible Server was returned in this subscription. This does not search other subscriptions or third-party databases. |
| Storage accounts | Complete list: 0 | No existing Azure storage account was returned in this subscription. |
| `Microsoft.DBforPostgreSQL` | `NotRegistered` | Read succeeded; no registration was attempted. |
| `Microsoft.Storage` | `NotRegistered` | Read succeeded; no registration was attempted. |
| `Microsoft.Network` | `NotRegistered` | Read succeeded; only relevant if a later approved networking design requires it. |
| Subscription locations | 109 advertised entries; both requested regions listed | A location advertisement is not capacity or an offer entitlement. |
| Caller permission endpoint | Two permission blocks returned | Grant-pattern evidence is present for RG creation, PostgreSQL creation, storage creation and role-assignment write. No write was tried; complete deny/policy/conditions/PIM analysis remains unknown. |

Inventory and permission reads returned HTTP 200. There were no observed 403/network failures in
these runs. That observation does not mean the tool's error branches or inaccessible scopes passed
testing; they were not exercised. Per-resource-group permissions were not queried because no
Dzirent-related group was identified. Other subscriptions, regions and unrelated resources were not
expanded beyond the required subscription inventories.

## Region and SKU evidence

[PostgreSQL capability GETs](https://learn.microsoft.com/en-us/rest/api/postgresql/capabilities-by-location/list?view=rest-postgresql-2025-08-01)
returned the following subscription-specific advertisements. API versions 11–18 were listed; the
application proposal deliberately stays on **major 17**. Listing an old or newer version is not a
reason to change the application's PostgreSQL 17 baseline. Managed-service patch level and actual
version/SKU pair provisioning have not been tested.

| Option | PostgreSQL 17 | Small Burstable SKUs advertised | Quota result | Storage option if later needed |
| --- | --- | --- | --- | --- |
| `southcentralus` | Listed | `Standard_B1ms` (1 vCore), `Standard_B2s` / `Standard_B2ms` (2 vCores) | HTTP 200, empty usage list; numeric limit/current unavailable | `StorageV2`, `Standard_LRS`, no listed restrictions |
| `eastus2` | Listed | `Standard_B1ms` (1 vCore), `Standard_B2s` / `Standard_B2ms` (2 vCores) | HTTP 200, empty usage list; numeric limit/current unavailable | `StorageV2`, `Standard_LRS`, no listed restrictions |

Both capability responses reported `OfferRestricted: Disabled`; status/restricted fields for the
overall capability and listed versions/SKUs were unspecified. Do not promote that absence of an
advertised restriction into a guarantee. Neither free eligibility, available regional capacity nor
sufficient effective creation authority is proved. SKU/version lists are independent advertisements,
not a checked compatibility matrix or a reservation.

The [quota API](https://learn.microsoft.com/en-us/rest/api/postgresql/quota-usages/list?view=rest-postgresql-2025-08-01)
returned no numeric quota/usage information in either region. **Quota remains unknown**, rather than
zero, unlimited, available or passed. Instantaneous service capacity remains unknown even if numeric
quota is obtained later. Storage's empty SKU restrictions likewise do not establish an account quota,
capacity, Students allowance, billing exemption or successful allocation.

## Minimal proposed resources — not applied

1. Keep the presentation/client hosting on the existing Vercel project. Do not create Azure compute,
   a new identity provider, networking resources or unrelated services in this discovery task.
2. Review the one existing resource group privately for reuse. If it is unsuitable/unrelated, propose
   one Dzirent development/staging group in the approved region; no name availability was checked.
3. If hosted persistence is the next approved dependency, propose **one PostgreSQL Flexible Server,
   major 17**, initially considering Burstable `Standard_B1ms` in `southcentralus`, with `eastus2` as
   an alternative to investigate. The two-vCore options above are alternatives if workload requirements
   and approved cost justify them. No performance, price, free allowance or capacity claim is made.
   Agree storage size, backup/restore needs, availability expectations, TLS/runtime/migration access
   and the FastAPI consumer/network path before creating anything. No hosted migration/seed ran.
4. **Defer a storage account** while the current 40 licensed sample photographs remain bundled on
   Vercel. If connected uploads are explicitly required, recheck reuse, then consider one general-purpose
   `StorageV2` / `Standard_LRS` account in the selected region. Agree least-privilege access, public
   derivatives/private uploads, retention, CORS and network access first. Do not retrieve account keys.

The historical setup-dependencies document lists Neon, S3 and Render as earlier proposals. This
assignment evaluates Azure PostgreSQL/storage only; it does not silently enact a provider migration
or rewrite app configuration. An approved provider/configuration decision must precede later connected
work. No business, payment, shipping or new application identity rules are introduced.

Concrete unresolved prerequisites:

- New user authorization for the exact resource plan, cost exposure and region/SKU; this task authorizes
  reads only. No creation, deployment, provider registration, RBAC or firewall changes are permitted now.
- Verify Students service-specific eligibility, allowance/remaining credit and expiry in the account's
  benefit/billing view; the subscription offer label alone is insufficient.
- Obtain an authoritative numeric PostgreSQL quota/eligibility answer for the chosen region/SKU
  (service quota/portal/support as appropriate), and separately establish allocatable capacity.
- Resolve required provider registration only in an authorized provisioning task: PostgreSQL if a
  server is approved, Storage only if storage is approved, Network only if the chosen design needs it.
- Confirm effective scoped permissions, relevant policy/deny/conditions/PIM and role-assignment
  authority. Returned action grants are evidence, not a complete authorization verdict.
- Approve the database's real API consumer/network/secret-management and backup/restore plan, then
  separately validate connectivity and serialized migrations. No connected browser-to-database
  journey or real application authentication has been demonstrated by ARM discovery.

## Actual verification and local evidence

Environment: Windows; existing managed Python **3.12.15**, uv **0.13.1**. Installed once in the separate
`infra/azure/.venv`: azure-core **1.41.0**, azure-identity **1.26.0**, azure-identity-broker **1.3.0**,
azure-mgmt-resource **26.0.0**, with 19 resolved runtime packages. Existing application locks unchanged.
Version selection uses official Microsoft/Azure SDK release histories; see the lock and tooling README.

Commands executed from `H:\DziRent\worktrees\codex-web`:

```powershell
& .tools/bootstrap/Scripts/uv.exe lock --project infra/azure --python 3.12.15
& .tools/bootstrap/Scripts/uv.exe sync --project infra/azure --frozen --python 3.12.15
& infra/azure/.venv/Scripts/python.exe -m py_compile infra/azure/discover.py
& infra/azure/.venv/Scripts/python.exe infra/azure/discover.py --help
& infra/azure/.venv/Scripts/python.exe infra/azure/discover.py --output-dir .local/discovery-2026-10-19 --timeout 180
```

Lock/install, syntax and help passed. First live run: **14 ARM GET attempts, approximately 18 seconds**,
UTC `2026-10-20T01:12:38+00:00`–`01:12:56+00:00`. It reported partial discovery due to storage SKU truncation
when the global storage SKU response (1,544 records) exceeded the original 500-record processing bound.
The quota endpoints' empty lists also could not establish quota; final handling explicitly marks that
insufficient evidence partial rather than describing the quota as verified.

Raised only storage SKU processing to a bounded 2,000 records and clarified empty quota status. After
source formatting, focused static checks (`ruff check --select E9,F63,F7,F82`) and syntax passed.
Reran only those affected sections plus the mandatory subscription gate:

```powershell
& infra/azure/.venv/Scripts/python.exe infra/azure/discover.py `
  --sections storage-skus postgres-quota `
  --resume .local/discovery-2026-10-19 --output-dir .local/affected-2026-10-19 --timeout 90
```

Affected run: **4 ARM GET attempts, approximately 10 seconds**, UTC `2026-10-20T01:14:11+00:00`–
`01:14:21+00:00`. VS Code authentication worked again without interaction. Storage SKU discovery
completed, with StorageV2 Standard_LRS listed in both regions and no reported SKU restrictions.
Quota stayed partial/unknown in both. **Exit 2, overall partial** is the expected honest result;
there is no claim that every discovery question passed. Successful unchanged sections retain their
original observation timestamps and tool hashes; no broad live scan was repeated.

Tool SHA256 for the affected run/final script:
`e9001ac310e75226e6c228a9851fb7794051e818cb1ef419b6f96453548550a5`.
Original scan tool SHA256:
`4d70e89533e12598f41bb180cc6a4d49f54cec6e111895d906bb7e0e77711345`.
Ignored source directories: `infra/azure/.local/discovery-2026-10-19/` and
`infra/azure/.local/affected-2026-10-19/`; both contain local findings/raw responses. Only this sanitized
report, code/configuration, an explicitly non-live example and scoped operating/log updates are committed.

Final delivery integrity checks passed: JSON/TOML parsing and direct-pin/lock alignment, final script
hash against live evidence, ignored raw/venv/bytecode paths, private-tenant/token exclusion from the
ten permitted deliverables, owned-path diff and `git diff --check`. These are source/evidence checks,
not unit tests or proof of unexercised cloud behavior. The staged whitespace check initially found
extra EOF blank lines in three new text files; those were normalized and the affected check passed.

Not run locally: unit tests, browser suites, application builds, hosted connectivity/migrations/seeds, write
permission trials, provider registration, real capacity allocation, benefit/billing consumption checks,
role/policy mutation, secret retrieval or Vercel deployment. No other agent was started or PR merged.

## Review handoff / security check blocker

[PR #24](https://github.com/Vivek-k24/Dzirent/pull/24) is reviewable, but its existing automatic secret
check reports a prose false positive in the original status-log addition (`docs/agents/codex.md`,
line 15). The match is the sentence/list describing unchanged application paths, not a credential.
The current wording is clarified, but the pinned action scans every commit in the PR; a follow-up
commit does not erase the historical finding. Exact fingerprint and job evidence are recorded on
the issue/PR. No real credential rotation is indicated by that prose-only finding.

The integrator must review the finding and authorize any exact historical allowlist entry before
merge. Root `.gitleaksignore` / CI are outside the permitted files here. They remain unchanged;
no security check was weakened and no pushed history was rewritten. Existing automatic Foundation/
Security workflows are separate from the bounded local verification; their unresolved status is not
claimed passed and does not justify rerunning application builds or Azure discovery from this lane.

Stop: review this discovery PR, the security finding and the unknowns above. Provisioning is a separate assignment.
Tool usage, safety limits and official SDK/API links: [infra/azure/README.md](../../infra/azure/README.md).
