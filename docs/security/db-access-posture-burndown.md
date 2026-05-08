---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
last_reviewed: 2026-05-08
---

# DB Access Posture Burn-Down

> Status: Archived SEC04B implementation receipt. The authoritative execution state remains in
> `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

SEC04B reduced the DB access posture baseline from `262` unclassified entries to `80`.
Classification stopped when the `<= 80` target was reached.

## Burn-Down Summary

| Metric                         | Count |
| ------------------------------ | ----: |
| SEC04A unclassified baseline   |   262 |
| SEC04B unclassified baseline   |    80 |
| Entries removed from scan      |     4 |
| Reviewed `tenant-scoped` calls |   158 |
| Reviewed `system-exempt` calls |    20 |

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

The e2e-only branch setup API was removed from the production posture baseline scan rather than
classified.

## Remaining Evidence Set

The remaining `80` entries are intentionally not classified in SEC04B. They include clusters that
need migration or a narrower design decision:

| Count | Cluster                                                                                           |
| ----: | ------------------------------------------------------------------------------------------------- |
|     5 | Commercial action idempotency records with optional tenant identity.                              |
|     5 | Legacy agent dashboard reads without current tenant proof.                                        |
|    14 | Billing webhook handlers and persistence paths that derive tenant identity from provider events.  |
|     7 | Campaign execution and communication paths that batch across users or campaigns.                  |
|     8 | Cron and public NPS/engagement residue that needs per-tenant job modeling or narrower predicates. |
|     4 | Admin and branch dashboard cross-tenant lookup paths.                                             |
|    37 | Smaller one-off application/domain paths requiring callsite-specific migration review.            |

Those entries should not be mass-stamped. The next action, if further burn-down is needed, is a
targeted design review for webhook/provider-event tenancy, commercial idempotency scoping, and
legacy agent dashboard ownership.
