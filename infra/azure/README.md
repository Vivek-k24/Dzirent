# Azure discovery and authorized staging tooling

The discovery/preflight tools use the existing Azure Resources VS Code sign-in. They create no Azure
resources and never registers providers, changes roles/networking, retrieves keys/passwords, runs
migrations or deploys applications. The public web client stays on Vercel. Dependencies are isolated
here; neither the API environment nor application locks are changed.

## Run on the assigned Windows workstation

Python **3.12.15** and uv **0.13.1** are required. From the repository root:

```powershell
# Use uv on PATH, or the already-installed checkout-local executable:
$discoveryUv = Join-Path (Get-Location) '.tools/bootstrap/Scripts/uv.exe'
& $discoveryUv sync --project infra/azure --frozen --python 3.12.15
& infra/azure/.venv/Scripts/python.exe -m py_compile infra/azure/discover.py
& infra/azure/.venv/Scripts/python.exe infra/azure/discover.py --help
& infra/azure/.venv/Scripts/python.exe infra/azure/discover.py --output-dir .local/my-run --timeout 180
```

The target defaults to `c4de17fc-7a0d-4376-8758-ba2b4f79b7c6`. The first ARM request must confirm
that exact subscription, `Enabled` state, tenant UUID and equality with the authenticated token's
tenant. Discovery stops at this gate on any mismatch or unavailable subscription. Token claims are
used only for this comparison after ARM accepts the token, never as an authorization decision.
Tokens remain in memory. No credential values, caches or HTTP authorization headers are written.

Authentication is explicit and bounded:

1. `VisualStudioCodeCredential` + `azure-identity-broker` attempts the Azure Resources account once.
   The pinned implementation disables interactive fallback. The SDK reads its own authentication
   record; this script does not copy it or inspect VS Code credential storage.
2. If that is unavailable/times out, inspect `az account show --subscription <target>` from existing
   CLI authentication. Only a matching enabled cached subscription is considered. Then the Azure
   Identity SDK's `AzureCliCredential` may acquire the ARM token. Never run `az login` or `account set`.
3. `--credential vscode` still reports existing CLI availability on failure, but does not switch to it.
   `--credential cli` explicitly uses existing CLI authentication. No interactive login is started.

If both routes are unavailable, `findings.json` reports a blocked run with error categories. Resolve
the named extension/account/tenant issue in VS Code (or existing CLI session) deliberately; do not
paste tokens, passwords or account-cache files into chat, issues or source control.

## Scope, safety and evidence

Management calls use the public Azure `ResourceManagementClient.send_request` SDK method and
`azure.core.rest.HttpRequest`. This supports current documented PostgreSQL quota/capability and
authorization GETs without coupling infrastructure libraries to the API or installing several service
SDKs. Exact direct versions and transitive artifacts are pinned in `pyproject.toml` / `uv.lock`.

The final SDK transport accepts **GET only**, only `https://management.azure.com`, only the selected
subscription and an allowlist of inventory/provider/location/capability/quota/SKU/permission paths.
It also guards pagination and redirects. There is no general URL or write-operation command option.
Authentication's necessary token exchange is separate from this ARM read-only boundary.

Discovery includes:

- Resource groups, PostgreSQL Flexible Servers and storage accounts, with name/tag/group matching
  for `dzirent`, `dzi-rent` or `dzi_rent`. An unlabeled resource can be missed by the heuristic;
  enumeration status/counts distinguish a full empty inventory from an inaccessible/truncated scan.
- Registration states and advertised resource-type regions/API versions for PostgreSQL, Storage
  and Network. No registration is attempted.
- Subscription region listing and PostgreSQL versions, tiers/SKUs, features/restrictions for the
  requested regions (default `southcentralus`, `eastus2`; one to four region codes).
- PostgreSQL quota usage GETs. Empty or nonnumeric quota responses are **partial/unknown**, even
  when HTTP 200. A numeric quota is still not a capacity reservation or Students entitlement.
- Storage `Standard_LRS` advertisements/restrictions for requested regions. StorageV2 is the proposed
  kind only if connected uploads later require it; public sample media already ship with the web app.
- Caller permission action evidence at subscription scope and up to three matching resource groups.
  Wildcard `actions`/`notActions` are evaluated per permission block. This is grant evidence only;
  complete policy/deny/conditions/PIM restrictions and actual creation/role-assignment success remain
  unverified. A 403 in one section does not erase successful independent findings.

Bounds: 180-second default hard subprocess wall clock (configurable 30–300), 20-second VS Code token
attempt, 12-second CLI inspection, 15-second CLI token attempt, 5/12-second ARM connect/read timeouts,
one retry, maximum 80 ARM request attempts, eight pages per list, 500 records per normal list and
2,000 per storage SKU list. Excessive retry waits and record/page bounds produce failures/partial data.
On timeout the last atomic findings survive; unreached sections remain `not_performed`.

Outputs are restricted to new run directories below ignored `infra/azure/.local/`:

- `findings.json`: allowlisted summaries, tenant/resource fingerprints, statuses, dates, tool SHA256,
  bounds, SDK versions and explicit unknowns. The supplied subscription UUID is non-secret config.
- `raw.json`: local-only ARM response bodies and HTTP statuses. Resource IDs/names/tags/tenant UUIDs
  may identify the account. No keys or passwords are requested; do not commit or attach this file.
  A run blocked before its first ARM GET may have no raw response file.

Exit **0** means all selected/inherited sections have complete discovery evidence. It never means
provisioning readiness. Exit **2** means blocked, failed, partial, unperformed or insufficient evidence.
Argument errors also use argparse's exit 2. Inspect the report's individual statuses and unknowns.
`discovery.example.json` is a non-live example excerpt, not a record of Azure findings.

## Rerun only an affected section

Use a new output directory and `--resume` to preserve prior successful sections, original timestamps
and tool hashes. Always review whether a code change invalidated inherited evidence. Subscription
verification still runs; no discovery proceeds on an old unverified identity. Resumed findings refer
to their source local run; keep both ignored run directories together.

```powershell
& infra/azure/.venv/Scripts/python.exe infra/azure/discover.py `
  --sections storage-skus postgres-quota `
  --resume .local/my-run --output-dir .local/affected-rerun --timeout 90
```

Do not repeat the successful broad scan or add unit/browser/application build suites for this task.
An SDK/API failure should be a precise section error, not a reason to create resources or change access.
The task ends at the pushed discovery PR and sanitized setup report; provisioning needs a later assignment.

## Issue #25 staging preflight (no provisioning)

The historical discovery assignment above ended at its PR. Issue #25 separately authorizes staging
setup only after its security, eligibility, quota and cost gates pass. The companion tool collects
bounded read-only billing/benefit, hosting, policy/deny and public-price evidence:

```powershell
& infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py --help
& infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py `
  --output-dir .local/staging-preflight-new --timeout 180
# Affected-section reruns always recheck the subscription/tenant and use new output directories:
& infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py `
  --hosting-skus-only --output-dir .local/staging-hosting-new --timeout 60
& infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py `
  --benefits-only --output-dir .local/staging-benefits-new --timeout 90
```

Reuses the isolated pinned environment and existing discovery helpers without changing discovery.
Authentication is VS Code only, with no interactive login or CLI fallback. A fresh exact subscription/
tenant gate precedes all other ARM calls. Fixed additional GET paths cover billing property, free
service resources, Web/App inventory/providers, Web SKUs, policy/deny assignments, permissions and
a usage sample. Credit/lots reads follow **only the billing profile linked by that verified
subscription**, with an exact profile-path allowlist; no arbitrary scope or unrelated-account
enumeration is accepted. Tokens stay in memory.

Public prices use a separate unauthenticated HTTPS client to `prices.azure.com`, no redirects,
15-second request timeout, at most three requests and 2 MB per response. A price next page makes
the result partial. Inherited ARM request/retry/list bounds apply and a supervisor enforces the
wall limit. Only new ignored `.local` directories receive output; raw billing responses may contain
private IDs/addresses and must stay local. Findings contain allowlisted summaries. No keys requested.

Exit **2 / blocked is expected**, even when useful reads succeed: the tool always leaves
`provisioning_ready=false` and cannot approve or prove allocation. Empty quota/SKU/usage lists do not
prove eligibility, capacity or free meters. No creation/registration, roles, migration, networking
change or deployment operation is implemented. The dated [staging handoff](../../docs/infra/azure-staging-handoff.md)
records actual credit/expiry, rates, unresolved gates, proposed security/cleanup and unrun hosted
acceptance. Clear that gate before issue #26; the existing demo stays unchanged.

## Authorized PostgreSQL provisioning — issue #25

The owner's October 20 authorization permits scoped first-party staging use of remaining Students
credit. The historical free-only restriction is superseded; personal charges, Marketplace purchases,
subscription upgrades and spending-limit removal remain prohibited. `provision_postgres.py` reuses
existing SDK/auth helpers; discovery/preflight remain read-only.

**Current:** the single approved-size create was rejected; both regions report OfferRestricted.
The tagged RG is empty. Do not retry allocation or remove the private attempt marker. Follow the
[current handoff](../../docs/infra/azure-staging-handoff.md) for the Azure support action needed.

Default is a local private plan, without cloud writes:

```powershell
& infra/azure/.venv/Scripts/python.exe infra/azure/provision_postgres.py --help
& infra/azure/.venv/Scripts/python.exe infra/azure/provision_postgres.py `
  --output-dir .local/staging-postgres-2026-10-20 `
  --preflight .local/staging-authorized-2026-10-20 `
  --discovery .local/staging-authorized-discovery-2026-10-20
```

Only under owner authority and financial/policy review, `--apply` allows registration, one exact
isolated RG and **one** PG17/B1ms/32 GB PUT. Evidence must be under 30 minutes old: exact enabled
Students subscription/tenant, both spending limits On, current unestimated net credit/planning reserve,
unexpired allowance, inventory and grant/deny checks. Live identity/limit and post-registration
regional PG17/B1ms access are rechecked. Listings never guarantee allocation.

The fixed ignored `issue-25-postgres-attempt.private.json` marker is created before the PUT. Denied
or ambiguous responses do not permit automatic retries/new-plan bypasses. SDK mutation retries are off.
Fixed method/path guards exclude delete, arbitrary URL, IAM, billing-conversion and firewall APIs.
Private credentials/errors/inventory/ledger stay in `.local`; tokens remain in memory.

For follow-up reads on the preserved state, append `--status-only` or `--region-check-only` to the
command above. Exit 2 is expected for actual not-found/restricted results. A later server Ready/exit 0
would not prove hosted API/persistence/auth acceptance. No allocation retry is currently authorized.

## Official references

- [VS Code credential](https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity.visualstudiocodecredential?view=azure-python)
  and [pinned silent-broker implementation](https://github.com/Azure/azure-sdk-for-python/blob/azure-identity_1.26.0/sdk/identity/azure-identity/azure/identity/_credentials/vscode.py).
- [ResourceManagementClient](https://learn.microsoft.com/en-us/python/api/azure-mgmt-resource/azure.mgmt.resource.resources.resourcemanagementclient?view=azure-python).
- [Subscription details](https://learn.microsoft.com/en-us/rest/api/resources/subscriptions/get?view=rest-resources-2022-12-01).
- [PostgreSQL capabilities](https://learn.microsoft.com/en-us/rest/api/postgresql/capabilities-by-location/list?view=rest-postgresql-2025-08-01)
  and [quota usages](https://learn.microsoft.com/en-us/rest/api/postgresql/quota-usages/list?view=rest-postgresql-2025-08-01).
- [Storage inventory](https://learn.microsoft.com/en-us/rest/api/storagerp/storage-accounts/list?view=rest-storagerp-2025-06-01)
  and [SKU advertisements](https://learn.microsoft.com/en-us/rest/api/storagerp/skus/list?view=rest-storagerp-2025-06-01).
- [Caller permissions](https://learn.microsoft.com/en-us/rest/api/authorization/permissions/list-for-resource-group?view=rest-authorization-2022-04-01).

Actual observations, validation boundaries and conditional setup plan: [sanitized report](../../docs/infra/azure-discovery.md).
