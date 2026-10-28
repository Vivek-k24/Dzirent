# Staging API database access — owner review required

At13:52 CDT October28, Azure completed deployment `dzirent-stage3-issue77-f1`.
Allocated **Linux F1** plan `asp-dzirent-staging-f1` and HTTPS staging app
`dzirent-api-staging-4265`. Actual hostname:
`https://dzirent-api-staging-4265.azurewebsites.net`.
This is a hosting allocation result; application publication and database readiness are not yet proven.

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

**No firewall additions have been applied.** The owner required networking review; exact proposed
changes are now available for approval while packaging/runtime configuration work continues.
Rollback would remove only these newly created named staging rules, retaining the owner rule.
