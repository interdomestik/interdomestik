---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
last_reviewed: 2026-05-17
---

# DB Access Posture Baseline

> Status: Archived implementation receipt. The authoritative execution state remains in
> `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

Generated from `scripts/ci/db-access-baseline.json` on 2026-05-17 after the architecture
posture burn-down reduced the remaining unclassified hard cases below the pilot ceiling.

## Summary

| Metric                      |      Value |
| --------------------------- | ---------: |
| Baseline version            |          2 |
| Baseline entries            |        617 |
| Guard runtime sample        |      1.00s |
| Pre-SEC04 runtime reference |      0.69s |
| Baseline JSON size          | 6385 lines |

SEC04B reduced the v2 classifier's unclassified entries from `262` to `80`, meeting the
DG05 target without classifying the remaining hard cases. P33-SEC10 then reduced the
canonical baseline from `80` to `67` by resolving every current unclassified Paddle
webhook entry under `packages/domain-membership-billing/src/paddle-webhooks/**`.
P33-SEC11 preserved the `67` unclassified count while adding one reviewed
tenant-scoped helper in `packages/domain-leads/src/convert.ts`.
P33-SEC12 then reduced the canonical baseline from `67` to `62` by resolving the
five-entry commercial action idempotency helper cluster.
P35-SEC01 reduced the canonical baseline from `62` to `61` by removing the
non-Paddle commission fallback tenant lookup.
P35-SEC02 reduced the canonical baseline from `61` to `56` by requiring session-derived
tenant proof for legacy agent-dashboard claim reads. The 2026-05-17 architecture burn-down then
reduced the baseline from `56` to `15` by classifying callsites with local tenant proof or explicit
metadata/token bootstrap rationale.

## Counts By Posture

| Tenant posture     | Count |
| ------------------ | ----: |
| `tenant-context`   |     5 |
| `tenant-scoped`    |   194 |
| `tenant-predicate` |   364 |
| `admin-privileged` |     0 |
| `system-exempt`    |    39 |
| `unclassified`     |    15 |

## Counts By Risk

| Risk             | Count |
| ---------------- | ----: |
| `app-layer`      |   317 |
| `domain-wrapper` |   300 |

## Counts By Posture, Risk, And File Prefix

| Count | Tenant posture     | Risk             | File prefix                              |
| ----: | ------------------ | ---------------- | ---------------------------------------- |
|   175 | `tenant-predicate` | `app-layer`      | `apps/web/src`                           |
|   111 | `tenant-scoped`    | `app-layer`      | `apps/web/src`                           |
|    56 | `tenant-predicate` | `domain-wrapper` | `packages/domain-claims/src`             |
|    49 | `tenant-predicate` | `domain-wrapper` | `packages/domain-users/src`              |
|    31 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-claims/src`             |
|    26 | `tenant-predicate` | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    19 | `tenant-predicate` | `domain-wrapper` | `packages/domain-communications/src`     |
|    19 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    15 | `system-exempt`    | `app-layer`      | `apps/web/src`                           |
|    15 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-leads/src`              |
|    14 | `tenant-predicate` | `domain-wrapper` | `packages/domain-analytics/src`          |
|    13 | `system-exempt`    | `domain-wrapper` | `packages/domain-analytics/src`          |
|    12 | `tenant-predicate` | `domain-wrapper` | `packages/domain-referrals/src`          |
|    10 | `unclassified`     | `app-layer`      | `apps/web/src`                           |
|     8 | `system-exempt`    | `domain-wrapper` | `packages/domain-membership-billing/src` |
|     5 | `tenant-context`   | `app-layer`      | `apps/web/src`                           |
|     5 | `unclassified`     | `domain-wrapper` | `packages/domain-communications/src`     |
|     4 | `tenant-predicate` | `domain-wrapper` | `packages/domain-activities/src`         |
|     4 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-activities/src`         |
|     4 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-communications/src`     |
|     4 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-users/src`              |
|     3 | `tenant-predicate` | `domain-wrapper` | `packages/domain-agent/src`              |
|     2 | `system-exempt`    | `domain-wrapper` | `packages/domain-activities/src`         |
|     2 | `tenant-predicate` | `domain-wrapper` | `packages/domain-documents/src`          |
|     2 | `tenant-predicate` | `domain-wrapper` | `packages/domain-leads/src`              |
|     2 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-documents/src`          |
|     2 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-referrals/src`          |
|     1 | `system-exempt`    | `domain-wrapper` | `packages/domain-communications/src`     |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-ai/src`                 |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-member/src`             |
|     1 | `tenant-scoped`    | `app-layer`      | `packages/shared-utils/src`              |
|     1 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-member/src`             |

## Remaining Review Input

The remaining `15` unclassified entries are intentionally left as hard cases. They are limited to
campaign execution, NPS/engagement cron residue, and subscription communication cron paths. Those
entries should not be mass-stamped; they need either per-tenant job modeling, helper-level tenant
proof, or a fresh design review.

P33-SEC10 note: DG14 inventoried `14` billing webhook/provider-event entries, but the synced
implementation baseline at `f34d0b48ba1b822facff5ee231b5f993f7070174` contained `13`
unclassified entries under the authorized Paddle webhook package path. All `13` are resolved.

P33-SEC11 note: the baseline now includes the tenant-scoped lead ownership preflight helper in
`packages/domain-leads/src/convert.ts`. It adds one reviewed direct DB access entry and does not
change the remaining `67` unclassified hard cases.

P33-SEC12 note: the commercial action idempotency helper in
`apps/web/src/lib/commercial-action-idempotency.ts` now requires explicit tenant or allowlisted
public scope before reservation access. Its five direct DB access entries are reviewed as
tenant-scoped, reducing the remaining hard cases to `62`.

P35-SEC01 note: the non-Paddle commission creation core in
`packages/domain-membership-billing/src/commissions/create.ts` no longer performs an ambient
`agentId` to `tenantId` fallback lookup. Commission creation now requires explicit non-empty tenant
scope before idempotency checks or writes, reducing the remaining hard cases to `61`. The known P34
CRM adapter baseline drift remains visible as non-failing `pnpm check:db-access` output and was not
refreshed in this receipt.

P35-SEC02 note: the legacy agent dashboard core in
`apps/web/src/actions/agent-dashboard/get.core.ts` now requires session-derived tenant scope before
staff/admin claim reads and adds direct `claims.tenantId` predicates to all five claim reads. The
baseline moves those five entries to `tenant-predicate`, reducing the remaining hard cases to `56`.
The known P34 CRM adapter baseline drift remains visible as non-failing `pnpm check:db-access`
output and was not refreshed in this receipt.

2026-05-17 architecture note: reviewed local tenant proof and metadata bootstrap callsites moved the
baseline from `56` to `15` unclassified entries. The residual set is intentionally constrained to
campaign, NPS/engagement, dunning, and communication cron surfaces that need a separate tenancy/job
modeling decision rather than inline posture stamping.
