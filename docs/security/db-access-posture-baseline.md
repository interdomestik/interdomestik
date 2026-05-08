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
classifier upgrade.

## Summary

| Metric                      |      Value |
| --------------------------- | ---------: |
| Baseline version            |          2 |
| Baseline entries            |        619 |
| Guard runtime sample        |      1.13s |
| Pre-SEC04 runtime reference |      0.69s |
| Baseline JSON size          | 6228 lines |

The v2 classifier currently reports `262` unclassified entries. That is above DG05's
target of `<= 80`, so SEC04 must not be treated as closed unless the design gate is amended
or the classifier is expanded within the approved recognition rules.

## Counts By Posture

| Tenant posture     | Count |
| ------------------ | ----: |
| `tenant-context`   |     5 |
| `tenant-predicate` |   352 |
| `admin-privileged` |     0 |
| `system-exempt`    |     0 |
| `unclassified`     |   262 |

## Counts By Risk

| Risk             | Count |
| ---------------- | ----: |
| `app-layer`      |   319 |
| `domain-wrapper` |   300 |

## Counts By Posture, Risk, And File Prefix

| Count | Tenant posture     | Risk             | File prefix                              |
| ----: | ------------------ | ---------------- | ---------------------------------------- |
|   165 | `tenant-predicate` | `app-layer`      | `apps/web/src`                           |
|   148 | `unclassified`     | `app-layer`      | `apps/web/src`                           |
|    56 | `tenant-predicate` | `domain-wrapper` | `packages/domain-claims/src`             |
|    48 | `tenant-predicate` | `domain-wrapper` | `packages/domain-users/src`              |
|    31 | `unclassified`     | `domain-wrapper` | `packages/domain-claims/src`             |
|    29 | `unclassified`     | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    25 | `tenant-predicate` | `domain-wrapper` | `packages/domain-membership-billing/src` |
|    19 | `tenant-predicate` | `domain-wrapper` | `packages/domain-communications/src`     |
|    14 | `tenant-predicate` | `domain-wrapper` | `packages/domain-analytics/src`          |
|    14 | `unclassified`     | `domain-wrapper` | `packages/domain-leads/src`              |
|    13 | `unclassified`     | `domain-wrapper` | `packages/domain-analytics/src`          |
|    12 | `tenant-predicate` | `domain-wrapper` | `packages/domain-referrals/src`          |
|    10 | `unclassified`     | `domain-wrapper` | `packages/domain-communications/src`     |
|     6 | `unclassified`     | `domain-wrapper` | `packages/domain-activities/src`         |
|     5 | `tenant-context`   | `app-layer`      | `apps/web/src`                           |
|     5 | `unclassified`     | `domain-wrapper` | `packages/domain-users/src`              |
|     4 | `tenant-predicate` | `domain-wrapper` | `packages/domain-activities/src`         |
|     3 | `tenant-predicate` | `domain-wrapper` | `packages/domain-agent/src`              |
|     2 | `tenant-predicate` | `domain-wrapper` | `packages/domain-documents/src`          |
|     2 | `tenant-predicate` | `domain-wrapper` | `packages/domain-leads/src`              |
|     2 | `unclassified`     | `domain-wrapper` | `packages/domain-documents/src`          |
|     2 | `unclassified`     | `domain-wrapper` | `packages/domain-referrals/src`          |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-ai/src`                 |
|     1 | `tenant-predicate` | `domain-wrapper` | `packages/domain-member/src`             |
|     1 | `unclassified`     | `app-layer`      | `packages/shared-utils/src`              |
|     1 | `unclassified`     | `domain-wrapper` | `packages/domain-member/src`             |

## Next Migration Input

The largest remaining unclassified clusters are in `apps/web/src`, `packages/domain-claims`,
`packages/domain-membership-billing`, `packages/domain-leads`, and
`packages/domain-analytics`. Those clusters should be reviewed before CSP Phase 1 or broader
CRM work is used to claim production maturity closure.
