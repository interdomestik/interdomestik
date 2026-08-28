---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-28
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Lean runtime is
> resolved only from the agreeing canonical JSON projection and live Git/GitHub facts.

## Active Queue

| ID           | Status        | Owner      | Work                                                | Exit Criteria                          |
| ------------ | ------------- | ---------- | --------------------------------------------------- | -------------------------------------- |
| `T117B-DATA` | `in_progress` | `platform` | Request-scoped context and exactly two projections. | Promote, implement, merge, then close. |

## Proof Ledger

| ID           | Source Refs                                                                                         | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                    |
| ------------ | --------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ------------------------------------------------ |
| `T117B-DATA` | [gate](./2026-08-28-t117b-data-design-gate.md); [admission](./2026-08-28-t117b-data-admission.json) | `pending` | `PR #1654` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Promotion pending; no product or closeout proof. |

## Next Selection

T-116 remains terminally complete. Prerequisite PR `#1653` installed the bounded sequential
authority without product runtime. Live promotion PR `#1654` selects root child `T117B-DATA` from
exact protected base `37ef98ed44f1d56ad15d4fa09bc2947ad4b2418b`; runtime waits for its exact
merge. PORTAL and CUTOVER remain default-denied by predecessor proof.

| Future UI branch | Status     | Constraint                                                      |
| ---------------- | ---------- | --------------------------------------------------------------- |
| `T117B-PORTAL`   | `deferred` | Requires exact DATA product merge and deterministic closeout.   |
| `T117B-CUTOVER`  | `deferred` | Requires exact PORTAL product merge and deterministic closeout. |
| `T-117C`         | `deferred` | Atomically owns cacheComponents, PPR, and named route slots.    |

## Lean Authority

<!-- prettier-ignore -->
```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "promotion_pending",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": {
    "sliceId": "T117B-DATA",
    "tier": 3,
    "promotionPrNumber": 1654,
    "promotionBaseSha": "37ef98ed44f1d56ad15d4fa09bc2947ad4b2418b",
    "expectedProductBranch": "codex/t117b-data",
    "gateSha256": "36b15cfd6fc33d21b56a266ee4de63f084a5c9755420f6754028545f35af30e2",
    "admissionSha256": "46df2f62785d89fa000bff6e601ad9f07464a7d6b9054de8b7f0ce946e6b56bb",
    "productWriterPaths": [
      "apps/web/src/lib/auth.server.ts",
      "apps/web/src/components/shell/member-portal-context.ts",
      "packages/domain-member/package.json",
      "packages/domain-member/src/case-summary/get-member-case-summaries.test.ts",
      "packages/domain-member/src/case-summary/get-member-case-summaries.ts",
      "packages/domain-member/src/case-summary/types.ts",
      "packages/domain-member/src/index.ts",
      "packages/domain-member/src/portal-runtime/get-member-portal-membership.test.ts",
      "packages/domain-member/src/portal-runtime/get-member-portal-membership.ts",
      "pnpm-lock.yaml"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T117B-DATA`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
