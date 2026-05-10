---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
last_reviewed: 2026-05-09
---

# DB Access Posture Baseline

> Status: Archived implementation receipt. The authoritative execution state remains in
> `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

Generated from `scripts/ci/db-access-baseline.json` on 2026-05-09 after P33-SEC12
hardened commercial action idempotency tenant scope.

## Summary

| Metric                      |      Value |
| --------------------------- | ---------: |
| Baseline version            |          2 |
| Baseline entries            |        616 |
| Guard runtime sample        |      1.00s |
| Pre-SEC04 runtime reference |      0.69s |
| Baseline JSON size          | 6395 lines |

SEC04B reduced the v2 classifier's unclassified entries from `262` to `80`, meeting the
DG05 target without classifying the remaining hard cases. P33-SEC10 then reduced the
canonical baseline from `80` to `67` by resolving every current unclassified Paddle
webhook entry under `packages/domain-membership-billing/src/paddle-webhooks/**`.
P33-SEC11 preserved the `67` unclassified count while adding one reviewed
tenant-scoped helper in `packages/domain-leads/src/convert.ts`.
P33-SEC12 then reduced the canonical baseline from `67` to `62` by resolving the
five-entry commercial action idempotency helper cluster.

## Counts By Posture

| Tenant posture     | Count |
| ------------------ | ----: |
| `tenant-context`   |     5 |
| `tenant-scoped`    |   168 |
| `tenant-predicate` |   353 |
| `admin-privileged` |     0 |
| `system-exempt`    |    28 |
| `unclassified`     |    62 |

## Counts By Risk

| Risk             | Count |
| ---------------- | ----: |
| `app-layer`      |   315 |
| `domain-wrapper` |   301 |

## Counts By Posture, Risk, And File Prefix

| Count | Tenant posture     | Risk             | File prefix                              |
| ----: | ------------------ | ---------------- | ---------------------------------------- |
|   165 | `tenant-predicate` | `app-layer`      | `apps/web/src`                           |
|    92 | `tenant-scoped`    | `app-layer`      | `apps/web/src`                           |
|    56 | `tenant-predicate` | `domain-wrapper` | `packages/domain-claims/src`             |
|    48 | `tenant-predicate` | `domain-wrapper` | `packages/domain-users/src`              |
|    47 | `unclassified`     | `app-layer`      | `apps/web/src`                           |
|    27 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-claims/src`             |
|    26 | `tenant-predicate` | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    19 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    19 | `tenant-predicate` | `domain-wrapper` | `packages/domain-communications/src`     |
|    14 | `tenant-predicate` | `domain-wrapper` | `packages/domain-analytics/src`          |
|    15 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-leads/src`              |
|    13 | `system-exempt`    | `domain-wrapper` | `packages/domain-analytics/src`          |
|    12 | `tenant-predicate` | `domain-wrapper` | `packages/domain-referrals/src`          |
|     8 | `system-exempt`    | `domain-wrapper` | `packages/domain-membership-billing/src` |
|     7 | `unclassified`     | `domain-wrapper` | `packages/domain-communications/src`     |
|     5 | `tenant-context`   | `app-layer`      | `apps/web/src`                           |
|     5 | `system-exempt`    | `app-layer`      | `apps/web/src`                           |
|     4 | `tenant-predicate` | `domain-wrapper` | `packages/domain-activities/src`         |
|     4 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-activities/src`         |
|     4 | `unclassified`     | `domain-wrapper` | `packages/domain-claims/src`             |
|     3 | `tenant-predicate` | `domain-wrapper` | `packages/domain-agent/src`              |
|     3 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-communications/src`     |
|     3 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-users/src`              |
|     2 | `system-exempt`    | `domain-wrapper` | `packages/domain-activities/src`         |
|     2 | `tenant-predicate` | `domain-wrapper` | `packages/domain-documents/src`          |
|     2 | `tenant-predicate` | `domain-wrapper` | `packages/domain-leads/src`              |
|     2 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-documents/src`          |
|     2 | `unclassified`     | `domain-wrapper` | `packages/domain-users/src`              |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-ai/src`                 |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-member/src`             |
|     1 | `tenant-scoped`    | `app-layer`      | `packages/shared-utils/src`              |
|     1 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-member/src`             |
|     1 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-referrals/src`          |
|     1 | `unclassified`     | `domain-wrapper` | `packages/domain-membership-billing/src` |
|     1 | `unclassified`     | `domain-wrapper` | `packages/domain-referrals/src`          |

## Remaining Review Input

The remaining `62` unclassified entries are intentionally left as hard cases. The largest
clusters are legacy agent dashboard reads, campaign execution, NPS/engagement cron residue,
admin/branch cross-tenant lookups, and smaller one-off application/domain paths. Those entries
should not be mass-stamped; they need either callsite migration, helper-level tenant proof, or a
fresh design review.

P33-SEC10 note: DG14 inventoried `14` billing webhook/provider-event entries, but the synced
implementation baseline at `f34d0b48ba1b822facff5ee231b5f993f7070174` contained `13`
unclassified entries under the authorized Paddle webhook package path. All `13` are resolved;
the remaining `1` unclassified `packages/domain-membership-billing/src` entry is
`packages/domain-membership-billing/src/commissions/create.ts` and is outside the SEC10 billing
webhook scope.

P33-SEC11 note: the baseline now includes the tenant-scoped lead ownership preflight helper in
`packages/domain-leads/src/convert.ts`. It adds one reviewed direct DB access entry and does not
change the remaining `67` unclassified hard cases.

P33-SEC12 note: the commercial action idempotency helper in
`apps/web/src/lib/commercial-action-idempotency.ts` now requires explicit tenant or allowlisted
public scope before reservation access. Its five direct DB access entries are reviewed as
tenant-scoped, reducing the remaining hard cases to `62`.
