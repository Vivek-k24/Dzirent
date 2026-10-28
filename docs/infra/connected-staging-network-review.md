# Staging API database access — approved and applied

At13:52 CDT October28, Azure completed deployment `dzirent-stage3-issue77-f1`.
Allocated **Linux F1** plan `asp-dzirent-staging-f1` and HTTPS staging app
`dzirent-api-staging-4265`. Actual hostname:
`https://dzirent-api-staging-4265.azurewebsites.net`.
This opening observation records allocation only. Subsequent publication, database readiness and
controlled CRUD/restart evidence are in the [verification report](connected-staging-verification-2026-10-28.md).

Verified from ARM: Linux/Python3.12, HTTPS-only, app/SCM minTLS1.2, FTPS disabled, SCM/FTP basic
publishing disabled, remote debug disabled, readiness path, system-assigned identity, free F1 SKU.
No SQL firewall, credentials, billing limits or live website changed. The plan's verified meter is
USD0/hour. No paid network gateway, KeyVault, registry, telemetry or storage was provisioned.

The existing database allows one narrow owner access rule. The staging host needs the following
**13 exact source IPv4 addresses**, obtained from its actual `outboundIpAddresses` property, to connect:

| Proposed source CIDR | Proposed source CIDR |
| --- | --- |
| `172.214.221.44/32` | `172.214.221.213/32` |
| `172.214.221.74/32` | `172.214.221.86/32` |
| `172.214.221.155/32` | `172.214.221.230/32` |
| `172.214.171.186/32` | `172.214.172.122/32` |
| `172.214.171.56/32` | `172.214.171.75/32` |
| `172.214.172.125/32` | `172.214.173.221/32` |
| `52.162.107.0/32` | |

Proposed change: add one named staging firewall rule per address, start=end that address; preserve
the existing owner rule. No CIDR range aggregation, all-Azure rule, possible-outbound superset or
production resource change. The machine-readable proposal is
[`infra/azure/staging-outbound-plan.json`](../../infra/azure/staging-outbound-plan.json).
Re-read the host and require an exact source-address-set match before execution; a changed set
requires a new review. These are shared App Service egress addresses, not a private identity-bound
network. Database authentication, least privilege and verify-full certificate validation remain
mandatory. This proposal is for isolated staging, not sufficient evidence for public production.

The owner explicitly approved these13 rules in the session. Applied and read back at13:59 CDT:
all13 exact start=end entries present, original owner rule's complete properties unchanged, total14
rules, no all-Azure exception. Azure's asynchronous rule operations initially produced a partial list;
completed missing entries serially with operation/visibility waits and verified the complete list.
Rollback removes only the new `dzirent-stage3-api-01` through `-13` rules, retaining the owner rule.

## Additional observed source — separately approved and applied

At14:18:51 CDT, the **actual API process** from source
`bc55f71113c06814532df5b82b3af0cdedd97994`, deployment
`eede9fed-93c0-4baa-959c-d4a80f37ca1e`, reported public HTTPS egress
**`172.214.222.211`**. This address is absent from Azure's still-unchanged13-address
`outboundIpAddresses` property. The Kudu sidecar independently observed the same public address.
The optional one-shot diagnostic sent no credentials to the egress observer; it then attempted
read-only PostgreSQL through the existing Settings/driver. Actual Python3.12.15, connected/native,
email disabled, CA file present, **ConnectionTimeout; no successful SQL connection**.

Proposed smallest next change: **one additional `172.214.222.211/32` database firewall rule**,
start=end this exact address, retaining all14 existing rules. No broader range, all-Azure exception,
paid network or new database resource. The original approval covered only the13 declared addresses,
so that frozen proposal at `fd0877143a2d8fa6e1a9f1de6eb171afac88cdc4` required separate approval.
Machine-readable [additional proposal](../../infra/azure/staging-observed-egress-proposal.json).

The owner then explicitly approved this additional /32. Rechecked the actual process diagnostic and
applied only `dzirent-stage3-api-observed-01` at14:25:57 CDT. All14 previous rules' properties were
unchanged; final total15, no range/all-Azure exception. Readiness became200. Subsequent actual
runtime-role SQL CRUD, HTTPS reads and restart persistence passed; see the verification report.
Rollback removes only this separately owned rule if explicitly requested. Future egress changes
require a fresh review; neither this approval nor the original13 authorize further addresses.
