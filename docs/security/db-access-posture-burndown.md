---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
last_reviewed: 2026-05-09
---

# DB Access Posture Burn-Down

> Status: Archived SEC04B implementation receipt. The authoritative execution state remains in
> `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

SEC04B reduced the DB access posture baseline from `262` unclassified entries to `80`.
Classification stopped when the `<= 80` target was reached. P33-SEC10 later reduced the
baseline to `67` by resolving the current Paddle billing webhook/provider-event cluster.
P33-SEC11 preserved the `67` unclassified count while adding one reviewed tenant-scoped
lead ownership preflight helper for Paddle lead conversion.
P33-SEC12 reduced the baseline to `62` by resolving the commercial action idempotency helper
cluster with explicit tenant or allowlisted public scope.
P35-SEC01 reduced the baseline to `61` by removing the non-Paddle commission ownership fallback
tenant lookup and requiring explicit commission tenant scope before idempotency checks or writes.

## Burn-Down Summary

| Metric                          | Count |
| ------------------------------- | ----: |
| SEC04A unclassified baseline    |   262 |
| SEC04B unclassified baseline    |    80 |
| P33-SEC10 unclassified baseline |    67 |
| P33-SEC12 unclassified baseline |    62 |
| P35-SEC01 unclassified baseline |    61 |
| Entries removed from scan       |     4 |
| Reviewed `tenant-scoped` calls  |   168 |
| Reviewed `system-exempt` calls  |    28 |

## Classification Rules Used

`tenant-scoped` directives were added only where tenant proof is local to the call boundary:

- `tenantId` from a validated function parameter.
- `tenantId` resolved into a local variable before the DB call.
- `tenantId` from a validated session or `authScope` in the current call path.
- Transaction operations whose tenant proof is enforced inside the transaction through values or
  `where` clauses.
- AI/policy queue operations where tenant identity comes from validated queue input or the queued
  run row.

`system-exempt` directives were limited to non-tenant data probes or intentional cross-tenant
system analytics:

- Health and optional table-existence probes that read no tenant data.
- Super-admin analytics aggregates that are intentionally cross-tenant.
- Privacy deletion audit trail writes.
- Login, push endpoint, and provider-reference bootstrap lookups that intentionally resolve
  tenant ownership before a tenant-scoped boundary exists.
- Paddle webhook `customData.userId` fallback lookup after canonical subscription lookup cannot
  resolve tenant ownership.
- Paddle webhook userId bootstrap lookups that resolve canonical tenant context before later
  subscription, dunning, or transaction audit writes are tenant-scoped.
- Paddle webhook receipt and invalid-signature audit rows that must persist before handler-level
  tenant resolution is safe.
- Checkout email ownership probes that intentionally detect cross-tenant conflicts before
  creating or updating a tenant-scoped member.

The e2e-only branch setup API was removed from the production posture baseline scan rather than
classified.

## Remaining Evidence Set

The remaining `61` entries are intentionally not classified. They include clusters that need
migration or a narrower design decision:

| Count | Cluster                                                                                           |
| ----: | ------------------------------------------------------------------------------------------------- |
|     5 | Legacy agent dashboard reads without current tenant proof.                                        |
|     7 | Campaign execution and communication paths that batch across users or campaigns.                  |
|     8 | Cron and public NPS/engagement residue that needs per-tenant job modeling or narrower predicates. |
|     4 | Admin and branch dashboard cross-tenant lookup paths.                                             |
|    37 | Smaller one-off application/domain paths requiring callsite-specific migration review.            |

Those entries should not be mass-stamped. P33-SEC10 resolved all current unclassified entries
under `packages/domain-membership-billing/src/paddle-webhooks/**`. DG14 had inventoried `14`
billing webhook/provider-event entries, but the synced implementation baseline contained `13`
under that package path. P33-SEC12 resolved the commercial idempotency cluster by requiring explicit
tenant or allowlisted public scope before reservation access. P35-SEC01 resolved the remaining
membership-billing unclassified entry by removing the non-Paddle commission ownership fallback
lookup and making tenant scope an explicit commission creation contract. The next action, if further
burn-down is needed, is a targeted design review for legacy agent dashboard ownership,
campaign/cron/public-token tenancy, or the remaining one-off paths. The known P34 CRM adapter
baseline drift remains non-failing guard output and was not refreshed by the P35-SEC01 receipt.
