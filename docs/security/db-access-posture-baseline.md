---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
last_reviewed: 2026-05-08
---

# DB Access Posture Baseline

> Status: Archived implementation receipt. The authoritative execution state remains in
> `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

Generated from `scripts/ci/db-access-baseline.json` on 2026-05-08 after the v2 posture
classifier upgrade and SEC04B burn-down pass.

## Summary

| Metric                      |      Value |
| --------------------------- | ---------: |
| Baseline version            |          2 |
| Baseline entries            |        615 |
| Guard runtime sample        |      1.13s |
| Pre-SEC04 runtime reference |      0.69s |
| Baseline JSON size          | 6378 lines |

SEC04B reduced the v2 classifier's unclassified entries from `262` to `80`, meeting the
DG05 target without classifying the remaining hard cases.

## Counts By Posture

| Tenant posture     | Count |
| ------------------ | ----: |
| `tenant-context`   |     5 |
| `tenant-scoped`    |   158 |
| `tenant-predicate` |   352 |
| `admin-privileged` |     0 |
| `system-exempt`    |    20 |
| `unclassified`     |    80 |

## Counts By Risk

| Risk             | Count |
| ---------------- | ----: |
| `app-layer`      |   315 |
| `domain-wrapper` |   300 |

## Counts By Posture, Risk, And File Prefix

| Count | Tenant posture     | Risk             | File prefix                              |
| ----: | ------------------ | ---------------- | ---------------------------------------- |
|   165 | `tenant-predicate` | `app-layer`      | `apps/web/src`                           |
|    88 | `tenant-scoped`    | `app-layer`      | `apps/web/src`                           |
|    56 | `tenant-predicate` | `domain-wrapper` | `packages/domain-claims/src`             |
|    52 | `unclassified`     | `app-layer`      | `apps/web/src`                           |
|    48 | `tenant-predicate` | `domain-wrapper` | `packages/domain-users/src`              |
|    27 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-claims/src`             |
|    25 | `tenant-predicate` | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    19 | `tenant-predicate` | `domain-wrapper` | `packages/domain-communications/src`     |
|    14 | `tenant-predicate` | `domain-wrapper` | `packages/domain-analytics/src`          |
|    14 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-leads/src`              |
|    14 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    14 | `unclassified`     | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    13 | `system-exempt`    | `domain-wrapper` | `packages/domain-analytics/src`          |
|    12 | `tenant-predicate` | `domain-wrapper` | `packages/domain-referrals/src`          |
|     7 | `unclassified`     | `domain-wrapper` | `packages/domain-communications/src`     |
|     5 | `tenant-context`   | `app-layer`      | `apps/web/src`                           |
|     4 | `system-exempt`    | `app-layer`      | `apps/web/src`                           |
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
|     1 | `system-exempt`    | `domain-wrapper` | `packages/domain-membership-billing/src` |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-ai/src`                 |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-member/src`             |
|     1 | `tenant-scoped`    | `app-layer`      | `packages/shared-utils/src`              |
|     1 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-member/src`             |
|     1 | `tenant-scoped`    | `domain-wrapper` | `packages/domain-referrals/src`          |
|     1 | `unclassified`     | `domain-wrapper` | `packages/domain-referrals/src`          |

## Remaining Review Input

The remaining `80` unclassified entries are intentionally left as hard cases. The largest
clusters are commercial action idempotency, legacy agent dashboard reads, billing webhook
handlers, campaign execution, NPS/engagement cron residue, and admin/branch cross-tenant
lookups. Those entries should not be mass-stamped; they need either callsite migration,
helper-level tenant proof, or a fresh design review.
