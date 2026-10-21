# Azure staging handoff — issue #25

## Current: authorized attempt blocked by regional offer access

Updated **October 20, 2026, America/Chicago**; run times below are UTC October 21.
**No operational staging database or HTTPS API exists.** One empty staging RG was created and the
PostgreSQL provider is registered. The live website, DNS and existing data remain unchanged. #26's
application work has not started. No AWS operation was performed; #34 is abandoned for this path.

Existing branch `codex/azure-staging-setup` / [draft PR #31](https://github.com/Vivek-k24/Dzirent/pull/31).
Fetched main/base remains `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`; normal reconciliation was already
up to date. Previous head `ae2bc3e6bead4a189256a3ddc7c9ce61d74f22c6` is preserved.
[Resumption claim](https://github.com/Vivek-k24/Dzirent/issues/25#issuecomment-6305346084).
Only `infra/azure/**`, this handoff and the own-agent log changed. Existing SDK/auth/discovery/preflight
helpers were reused; no API/schema/contract/fixture/dependency/CI changes, agents, merge or production cutover.

The owner now authorizes first-party development/staging consumption of remaining Students credit.
The archived **free-only stop is superseded**. No subscription upgrade, spending-limit removal,
personal charge, Marketplace/support-plan purchase or payment-method change was authorized or made.

### Financial and permission evidence

Existing VS Code Azure Resources authentication worked. Exact subscription, Enabled state and
token/subscription tenant matched. Fresh linked-profile reads verified a positive **current**,
non-estimated USD balance after pending charges, sufficient for the initial planning reserve and
unexpired beyond the initial seven-day review. Both subscription and billing-profile spending limits
were **On before and after** writes; Students offer and Free/Active billing remained unchanged.
Exact balances/dates/IDs and the private ledger stay ignored. Reported current balance was unchanged;
this is not an invoice or zero-charge guarantee. No metered compute/storage/host/registry was created.
See [Students terms](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p/) and
[spending-limit protections/exceptions](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/spending-limit).

The free-service meter GET still returned 404; this did not prevent the authorized credit-funded
attempt. Five policy definitions/initiative and parameters were reviewed: South Central/East US 2
permitted by the location list, West Europe denied, MFA audit modes, no security-initiative identity.
No deny assignments returned at scope; relevant grant patterns present. Registration/RG creation
proved those operations, not unrestricted permission. Additional spend alerts remain unconfigured
while no metered stack exists; configure meaningful owner alerts when supported before leaving a
later metered stack running. Alerts are not caps; keep the Students limit On.

### Actual changes and diagnosis

| Operation | Actual result |
| --- | --- |
| PostgreSQL provider registration | POST HTTP 200 at 01:13:31; subsequent state **Registered** |
| `rg-dzirent-staging-scus` creation | PUT HTTP 201 at 01:14:48; South Central US; exact project/staging/run/review tags verified |
| PostgreSQL allocation | **One PUT** at 01:14:49; HTTP 400 `ParameterOutOfRange` |
| Requested configuration | PG17, Burstable `Standard_B1ms`, Premium_LRS/P4 32 GB, autogrow off, seven-day LRS backups, no HA/replicas/geo-backup, system-managed encryption |
| Subsequent server GET | **404**, no PostgreSQL server/database created |
| Final owned-group inventory | Complete, **zero resources**; original unrelated RG untouched |
| Other resources | No host/registry, SQL roles/schema/data, broad ingress, VNet, firewall/IAM change; Storage/Network still NotRegistered; Web/App not registered |

Create error: `The value of the 'Version' should be in: []. Verify that the specified parameter value is correct.`

Before registration, capabilities advertised PG17/B1ms and quota lists were empty. **After registration,
both `southcentralus` and `eastus2` report `OfferRestricted=Enabled`, with no supported versions/SKUs.**
East US 2's first read timed out; one focused read-only retry confirmed the restriction. No East US 2
create was attempted. Numeric quotas now show **16 regional cores / 8 Burstable cores, usage 0** in
both regions. Quota is not the demonstrated blocker and does not prove capacity or offer access.
The capability reason explicitly directs a **Service and subscription limits** request for regional
access. Do not infer that PG17 is globally unsupported. No larger SKU, older version, other-region
allocation or repeated create was substituted; the issue's one-attempt/stop-on-denial limit remains.

The helper now checks regional access/version/SKU **after registration and before creation**. Its
final read-only execution correctly blocked and made zero mutations. Evidence distinguishes the
original allocation helper hash `8bb390520dda7aaa090247886f9f5c420b087cbeb9a40bd2a8fcf8db2b2647d0`
from the final admission-guard hash `513eebec64de3a3b64d168f5c8be7840ca69ab5fce47be1b38b77e04bf4d6c68`.

### Actual checks

Windows / Python 3.12.15 / existing pinned Azure SDK environment / Ruff **0.6.9** / Docker 28.0.1 Linux.
No dependency changes. [Commands and helper behavior](../../infra/azure/README.md).

| Check | Result |
| --- | --- |
| Fresh preflight | 17 ARM attempts, 01:00:25–01:00:58; current financial gates verified; helper remains blocked by design |
| Selected discovery | 10 ARM attempts, 01:03:17–01:03:24; inventory/providers/capabilities/grants |
| Policy review | Six ARM GETs using existing helpers; no policy change |
| Provisioning checks | Ruff check/format, Python compile/help, local plan, no-network delete/billing/unrelated-provider rejection passed; actual allocation exited 2 on HTTP 400 |
| Post-registration diagnosis | 10 ARM attempts, 01:16:41–01:17:24; South Central restriction/numeric quotas, East US 2 timeout |
| Focused East US 2 retry | Three ARM attempts, 01:24:15–01:24:30; offer restriction confirmed |
| Final admission guard | 01:29:04; read-only blocked/exit 2, no mutations |
| Final financial reads | Five ARM attempts, 01:29:05–01:29:14; current credit/expiry/both limits reverified |
| Final group inventory | Run ownership/tags verified; complete zero-resource list |
| API Docker build | `docker build --progress plain -f services/api/Dockerfile -t dzirent-api:azure-staging-8fcdc8d .` **passed**, frozen deps, allowlisted 435 KB context |
| Image security smoke | Network-isolated `docker run --rm --network none -i ... python -`: UID 10001, private workspace/env paths absent, staging mock auth and missing-Clerk settings rejected |
| Migration graph | Network-isolated `alembic heads` → **`0002_studios (head)`**; no upgrade run |

Local image ID `sha256:c7b8761d81d23dd50efb32a504c83a8b704df7b62f9faf134063cdf357c9a58f` contains
unchanged API code at main `8fcdc8d`. It was **not published or deployed**. Final privacy/ignore/source/
whitespace checks and CI are recorded at the exact pushed SHA on PR #31. No local unit/browser suite
or broad app build; CI disposable-PostgreSQL checks do not prove hosted Azure acceptance.

Unrun: remote SQL/TLS, DB/migrator/app roles, Alembic upgrade, seed/data transfer, HTTPS API/readiness,
restart persistence, authenticated CRUD/cross-owner tests, restore, sign-up/login. There is no remote
database to test. No local user data copied; prefer canonical fixtures over arbitrary dumps.

### Exact external actions and continuation

**Azure:** request **Service and subscription limits → PostgreSQL Flexible Server region access** in
Azure Help + support for South Central US or East US 2 on the existing Students offer. Include:

```text
Development/testing PG17, Standard_B1ms, 32 GB, no HA/replicas. Provider Registered.
Both regions report OfferRestricted=Enabled and empty versions/SKUs. One South Central
create returned HTTP 400 ParameterOutOfRange: Version should be in []. Numeric quota:
16 regional / 8 Burstable cores, usage 0. Enable an eligible region without upgrading
the Students offer or removing its spending limit.
```

Microsoft documents [this region-access action](https://learn.microsoft.com/en-us/azure/postgresql/troubleshoot/how-to-resolve-capacity-errors#enable-region).
Use billing/subscription support included with [Basic support](https://azure.microsoft.com/en-us/support/plans/),
not a paid support plan or pay-as-you-go conversion. No support message was sent here. This is an
access blocker, **not a request for new cost approval**. After access changes, recheck eligibility/credit
and obtain owner review of the exhausted one-attempt boundary before another allocation.

**Clerk:** owner selected **Dzirent Staging**, a dedicated development application. No usable local
keys/issuer/CLI connection or enabled browser found. Sign in to the [Clerk Dashboard](https://dashboard.clerk.com/),
reuse a suitable development instance or create that app, then provide its actual public Frontend API
URL. Prefer the public verification key/JWKS in protected `DZIRENT_CLERK_JWT_KEY`, actual HTTPS issuer,
and the real exact staging web origin for authorized parties/CORS once available. No secret in chat,
Git or client code. No invented issuer/auth bypass. Only this provider step needs browser access;
it did not prevent the PostgreSQL attempt or runtime preparation. Full auth UX follows in #26.

### Cost, residual resource and cleanup

Conditional South Central retail remains USD 0.0204/hour B1ms, 0.138/GB-month data, 0.114/GB-month
backup overage: PG + 32 GB about **USD 19.31/730-hour month** before benefits. Linux B1 at 0.018/hour
would bring core costs to **USD 32.45**; F1 requires actual eligibility/suitability. Transfer, excess
backups, registry/logging and other meters are additional/variable. These are estimates, not charges
or caps. No metered host/registry was allocated while DB access is blocked. Seven-day review is a
private planning horizon/tag, not automated cleanup; extra alerts were not configured.

State/credentials/IDs/billing ledger stay ignored in `infra/azure/.local/`. Preserve
`staging-postgres-2026-10-20` and `issue-25-postgres-attempt.private.json`. The helper's mutation retries
are off, operations/targets fixed, and another allocation is refused when the issue marker exists.
No delete/IAM/billing-conversion/firewall operation exists; tokens remain in memory and passwords
never enter argv/logs/images. Keep the empty tagged RG for reviewed reuse, or verify exact ID/tags/
empty membership before chosen cleanup. Preserve the original unrelated RG and registered provider.
Any successful later stack needs a creation/usage ledger, alerts, private backup and graceful shutdown
before credit expiry; stopped PG still has storage cost. Preserve the live demo. Once access/minimum
Clerk config are available: isolated DB/roles → migrate once → smallest suitable costed HTTPS API →
verify real persistence/security → immediately #26. Neither issue is complete.

<details>
<summary>Archived read-only preflight before provisioning authorization</summary>

Observed **2026-10-20 UTC**. Status: **stopped before provisioning at the cost/eligibility/quota gate**.
There is no hosted staging API or database to call operational. Issue #26 has not started.

## Baseline and scope

- Worktree `H:\DziRent\worktrees\codex-web`; branch `codex/azure-staging-setup`.
- Exact main baseline: `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`, fetched before starting.
- [Issue #25 claim](https://github.com/Vivek-k24/Dzirent/issues/25#issuecomment-6303141462).
- Owned changes: read-only `infra/azure/staging_preflight.py`, its README, this handoff and the Codex log.
  Existing discovery, application code, contracts, fixtures, dependencies and CI remain unchanged.
- No Azure creation/registration, role/network change, key retrieval, migration, image publishing,
  Vercel/DNS change or merge occurred. The existing live demo remains in place.
- Final commit and CI links are recorded on the PR and #25 after creating the commit.

## Actual findings

| Gate | Observed result | Limit |
| --- | --- | --- |
| Identity | Silent `VisualStudioCodeCredential` plus existing identity broker worked on every run | No new login or CLI fallback needed |
| Subscription | Exact `c4de17fc-7a0d-4376-8758-ba2b4f79b7c6`, Enabled, matching token/subscription tenant; fingerprint `5e8e56408505` | No tenant or subscription switch |
| Offer | `AzureForStudents_2018-01-01`; subscription/billing-profile spending limits On; billing type Free/Active | Classification is not service-specific entitlement |
| Credit | Linked billing-profile API returned a positive current balance and `isEstimatedBalance=false` | Observed at 22:38 UTC; exact financial values stay in ignored local evidence; credit does not make a metered service free |
| Expiry | Active Students spending-limit record and one credit lot agree on an unexpired end date | Exact dates stay in ignored local evidence; credit expiry verified, service quantities still unknown |
| Free services | Subscription `Microsoft.BillingBenefits/freeServices` GET: **404 `InvalidResourceType`**; usage sample: empty list | No remaining PG compute/data/backup allowance proven; no usage does not establish entitlement |
| Inventory | 1 RG / zero Dzirent name/tag matches; zero PG Flexible Servers, storage accounts, Web Apps, App Service plans, Container Apps or managed environments | No positively identified Dzirent group or hosted API/DB to reuse; preserve the unidentified RG |
| Providers | DBforPostgreSQL, Storage, Network, Web and App all NotRegistered | No registration performed |
| Policy | Five assignments at/above subscription; allowed-locations parameter includes `centralus`, `eastus2`, `southcentralus`, `northcentralus`, `eastus`; another assignment blocks West Europe; MFA audit policies and ASC default also present | Full definition/initiative/exception/condition analysis remains incomplete |
| Deny / grants | Zero returned deny assignments atScope; grant patterns present for RG/PG/Web/App creation and required registrations | Evidence of grants/listings is not proof of effective creation authorization |
| PG capability | South Central US advertises PG17 and Burstable `Standard_B1ms` / 1 vCore; `OfferRestricted` Disabled | Not a reservation or exact version/SKU-pair allocation guarantee |
| PG quota | Both regional quota GETs: HTTP 200, empty `value` arrays | **No numeric quota or spare capacity proven**; not zero usage or unlimited quota |
| Secondary region | East US 2 PG capability read timed out after the bounded retry | No fresh pass claimed; South Central US remains proposed |
| Hosting | Web SKU GET: HTTP 200 `{"value":[]}`, confirmed by focused rerun | F1/B1 subscription eligibility, hosting quota and allocation unknown |
| Local config | No local env file or nonempty process setting for the API's `DZIRENT_DATABASE_URL` / `DZIRENT_CLERK_*` | Real staging verifier/origin/test identities are needed before authenticated live acceptance |

The owner must confirm that this use fits the [Students program's educational/noncommercial purposes](https://learn.microsoft.com/en-us/azure/education-hub/azure-dev-tools-teaching/azure-students-program),
including permitted development/test/demonstration. The generic billing field
`subscriptionWorkloadType=Production` does not grant commercial-production rights. Do not remove spending
limits, change subscriptions or upgrade the offer to bypass eligibility constraints.

## Costed proposal — not created or approved

Prefer **southcentralus**: the requested PG17/B1ms is advertised and the returned policy permits the
region. Do not silently choose East US 2, another server SKU or a larger paid service.

The [official Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
was queried in USD using `armRegionName eq 'southcentralus'` / `priceType eq 'Consumption'`. Complete
first pages returned 143 PostgreSQL, 113 App Service and 16 Container Apps meters. This is public retail
evidence, **not a subscription quote or proof of a free grant**.

| Proposed component | Exact observed rate and assumption | Before-benefit comparison |
| --- | --- | --- |
| One PG17 Flexible Server | Flexible Server Burstable BS Series Compute, B1MS, USD 0.0204/hour; 730 hours | USD 14.892/month |
| 32 GB PG data | Flex Server Storage, Storage Data Stored, USD 0.138/GB/month; included IOPS only | USD 4.416/month |
| PG backup overage | Flexible Server Backup Storage LRS Data Stored, USD 0.114/GB/month above included allowance | Variable; observe retained backup/WAL usage |
| Linux App Service F1 candidate | Free Plan – Linux, F1 App, USD 0/hour | Conditional on actual subscription/region/custom-image/memory/CPU/network support; **not verified** |
| Conditional Linux B1 fallback | Basic Plan – Linux, B1, USD 0.018/hour; one worker, 730 hours | USD 13.14/month; explicit approval required |
| Container Apps comparison | Standard active CPU USD 0.000024/vCPU-second, memory USD 0.000003/GiB-second, requests USD 0.40/million before grants | Usage dependent; not selected solely on advertised free grants |

Core retail subtotal: **USD 19.308/month** for PG + 32 GB, or **USD 32.448/month** including one Linux
B1 API worker at 730 hours. The latter would be about USD 32.986 at 744 hours. No resource created by
this task is charging, because none was created.

These subtotals exclude unverified data-transfer/networking charges, backup overage, taxes, registry,
paid logs/monitoring, paid IOPS/autogrowth and other extra services. They are neither caps nor spending
authorization. Verify applicable meters before creation. The [Students offer](https://azure.microsoft.com/en-us/free/students/)
advertises eligible PG B1ms / 32 GB data / 32 GB backup allowances; this subscription's actual remaining
allowance was not verified. Credit can cover metered consumption without making it free. Budget alerts
are notifications, not caps.

Verify F1 first. The [custom-container quickstart](https://learn.microsoft.com/en-us/azure/app-service/quickstart-custom-container)
contains F1 portal and B1 extension paths; neither proves subscription allocation. Do not automatically
upgrade to B1. A conditional App Service plan offers a simpler network proposal than introducing NAT:
inspect its actual [outbound IP set](https://learn.microsoft.com/en-us/azure/app-service/overview-inbound-outbound-ips)
and allow those addresses individually on PG. Container Apps remains conditional on its changing
[outbound networking](https://learn.microsoft.com/en-us/azure/container-apps/networking) and all managed
network/environment costs. No NAT, private endpoint, workspace, Key Vault or registry is approved or
created. Existing/public image distribution might avoid a new paid registry but must be verified.

## Security and provisioning sequence after gates clear

1. Recheck identity, credit/expiry, actual free-service meters, numeric PG/hosting quota, capacity,
   effective scoped permissions and policy. Confirm permitted Students use and obtain approval for
   any nonzero or uncertain incremental cost. Register only providers required by the approved plan;
   do not register BillingBenefits merely to chase a benefit response or grant additional privileges.
2. Reuse only a positively identified suitable Dzirent RG; otherwise propose one isolated
   `rg-dzirent-staging-scus`, with project/environment/owner/expiry tags and verified name availability.
   Preserve the unidentified existing RG. Keep an exact resource-ID creation ledger.
3. Create at most one PG17 Burstable `Standard_B1ms` / 32 GB, without HA, replicas, geo-backup,
   paid extra IOPS or storage autogrowth. Use seven-day retention and the included backup allowance.
   [Backup above provisioned storage is billable](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore).
   Do not create restore servers as an unapproved verification shortcut.
4. Require PG TLS with certificate/hostname verification. Allow only observed app egress addresses
   and a temporary exact operator IP for the serialized migration; remove the operator rule afterward.
   Never open all IPs or the broad “allow Azure services” rule. Recheck rules when egress changes.
   A private-network alternative requires its own cost/security review.
5. Separate admin/migration access from a least-privilege runtime DB user. Store fresh secrets only
   through protected deployment settings, never source, output, history, images or browser storage.
   No extra secret store or registry is implicitly authorized.
6. Deploy the existing [`services/api/Dockerfile`](../../services/api/Dockerfile) by reviewed image
   digest, nonroot, correct port, HTTPS-only, explicit `connected` / `staging` / Clerk identity.
   Configure exact staging CORS and authorized parties. Mock identity is intentionally rejected in
   staging; do not weaken that guard or relabel staging local/test to make it start.
7. Follow [runtime instructions](../../infra/runtime/README.md): one serialized `alembic upgrade head`
   against the direct TLS staging connection, not per replica. Use disposable records only; record
   PG major, expected head, image digest and application SHA. No production dump/private data.
8. Run the live acceptance matrix below, report #25's actual result, then proceed directly to #26 with
   a scoped claim and ownership handoffs. Keep the public demo unchanged throughout.

Identity prerequisite: a dedicated Clerk dev/staging application, issuer/public verifier material,
exact staging origin/authorized parties and two isolated renter/lender test identities. None is
configured here. Supply these via protected provider/deployment setup; never post private keys or
passwords on issues. #25's protected live checks need this prerequisite even though complete auth UX
belongs to #26. Do not implement a mock identity bypass to avoid this dependency.

## Actual validation

Environment: Windows, managed Python 3.12.15, existing isolated Azure SDK environment (core 1.41.0,
identity 1.26.0, broker 1.3.0, resource SDK 26.0.0), existing Ruff 0.17.1. No dependency installation or
upgrade was needed. Retail HTTPS calls are unauthenticated and receive no ARM token.

| Actual command/run | Result |
| --- | --- |
| `infra/azure/.venv/Scripts/python.exe infra/azure/discover.py --credential vscode --output-dir .local/staging-2026-10-20 --timeout 180` | 22:29:31–22:30:12 UTC, 15 ARM attempts; partial, with East US 2 capability timeout and numeric quotas unknown. PowerShell tool exit 1; no passing discovery claim |
| `infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py --output-dir .local/staging-gates-2026-10-20 --timeout 180` | 22:32:11–22:32:27 UTC, 13 ARM attempts + 3 retail reads; exit 2 / blocked. Initial Web SKU parser rejected the empty collection |
| `infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py --hosting-skus-only --output-dir .local/staging-hosting-skus-2026-10-20 --timeout 60` | 22:34:31–22:34:32 UTC, 2 ARM attempts; exit 2 / blocked. Fixed parser records empty SKUs partial/unknown; other successful sections were not repeated |
| `infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py --benefits-only --output-dir .local/staging-benefits-2026-10-20 --timeout 90` | 22:37:57–22:38:08 UTC, 5 ARM attempts; exit 2 / blocked. Credit/expiry found; service meters unverified after 404 |
| `services/api/.venv/Scripts/ruff.exe check infra/azure/staging_preflight.py` | Passed after changes |
| `services/api/.venv/Scripts/ruff.exe format --check infra/azure/staging_preflight.py` | Passed; final file already formatted |
| `infra/azure/.venv/Scripts/python.exe -m py_compile infra/azure/staging_preflight.py` and script `--help` | Passed after changes |
| `infra/azure/.venv/Scripts/python.exe infra/azure/staging_preflight.py --output-dir docs/unsafe-output --timeout 60` | Correctly rejected with argparse exit 2 before authentication; output must remain under ignored `.local` |
| `git diff --check` | Passed locally before commit |

An initial exploratory retail lookup returned the same rates. Browser-session inventory exposed no
connected browser, so authenticated portal verification was unavailable and no login was attempted.
Environment checks printed configuration names/presence only. Private billing IDs/addresses, exact
account balances/dates, raw tenant/resource details and `raw.json` stay in ignored `infra/azure/.local/`;
do not attach them. Only summarized gate outcomes belong in this public repository.
Earlier successful evidence retains its timestamps/tool hashes. Focused parser/benefit changes do not
turn older observations into tests of the entire final script. CI is recorded against the pushed
commit on the PR; no pass is implied here. No unit/app/browser suite was run for this preflight.

**Operational acceptance remains unrun/blocked:**

- HTTPS `/api/v1/health/live` and `/api/v1/health/ready`, real PG17 and expected Alembic head.
- Disposable API write → hosted DB read → API restart → persisted read.
- Anonymous protected write returning 401; cross-owner denial with isolated real identities.
- Live TLS, DB privileges, secret/firewall inspection, image build/start and cleanup/rollback execution.
- All hosted sign-up/login/browser acceptance and other issue #26 checks.

## Rollback and next action

No staging resource exists to roll back. Do not delete the existing RG or subscription resources.
After approved creation, review membership and delete only tagged staging IDs from the creation ledger;
remove temporary firewall rules/identities and verify no orphaned plan, backup, registry, workspace or
network resource continues billing. Stopping PG is not proof of zero storage cost. API rollback uses a
prior reviewed image with compatible schema, never an unreviewed destructive downgrade. The Vercel
demo does not participate in this rollback.

**Next action: owner review of the cost/offer decision before any Azure write.** Confirm permitted
Students use and either verify free-service meter evidence or explicitly authorize the proposed
metered staging plan/credit consumption, including any agreed usage overages. The conditional B1 core
estimate is about USD 32.45/month before benefits. Cost approval alone does not clear numeric quota,
capacity, hosting eligibility, effective policy or Clerk configuration requirements. Do not mark #25
complete, deploy connected web or begin #26 implementation until real hosted staging acceptance passes.

Official APIs: [billing property](https://learn.microsoft.com/en-us/rest/api/billing/billing-property/get?view=rest-billing-2024-04-01),
[credit balance](https://learn.microsoft.com/en-us/rest/api/consumption/credits/get?view=rest-consumption-2024-08-01),
[credit lots](https://learn.microsoft.com/en-us/rest/api/consumption/lots/list-by-billing-profile?view=rest-consumption-2024-08-01),
[free services](https://learn.microsoft.com/en-us/rest/api/billingbenefits/free-services/list-by-subscription?view=rest-billingbenefits-2026-06-01),
[hosting SKUs](https://learn.microsoft.com/en-us/rest/api/appservice/list-skus/list-skus?view=rest-appservice-2024-11-01).

</details>
