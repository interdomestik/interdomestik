---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-27
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Lean runtime is
> resolved only from the agreeing canonical JSON projection and live Git/GitHub facts.

## Active Queue

| ID                   | Status        | Owner      | Work                                   | Exit Criteria                     |
| -------------------- | ------------- | ---------- | -------------------------------------- | --------------------------------- |
| `T-116-CASE-SUMMARY` | `in_progress` | `platform` | Safe projection and accident registry. | Promote, implement, merge, close. |

## Proof Ledger

| ID                   | Source Refs                                                                                                       | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | --------------------------------------------- |
| `T-116-CASE-SUMMARY` | [gate](./2026-08-27-t116-case-summary-design-gate.md); [admission](./2026-08-27-t116-case-summary-admission.json) | `pending` | `PR #1646` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Promotion and seven-path product are pending. |

## Next Selection

PR `#1646` projects T-116 only after exact branch/base/head validation and promotion merge.

| Future UI branch | Status     | Constraint                                                   |
| ---------------- | ---------- | ------------------------------------------------------------ |
| `T-117B`         | `deferred` | Waits for T-116 closeout and a separate Tier-3 runtime gate. |

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
    "sliceId": "T-116-CASE-SUMMARY",
    "tier": 2,
    "promotionPrNumber": 1646,
    "promotionBaseSha": "43ef9c2685a9bfa2fafb2cb6a47f373cff156b27",
    "expectedProductBranch": "codex/t116-case-summary",
    "gateSha256": "c740e2cb732729625cb7608e715a9c924265fa801b6079bd658a717e76a7074d",
    "admissionSha256": "270f91e0a4f9004411b7a4dfc0b1f94dc3d4dba15925f044de3a726053441e2c",
    "productWriterPaths": [
      "packages/domain-member/src/case-summary/types.ts",
      "packages/domain-member/src/case-summary/get-member-case-summaries.ts",
      "packages/domain-member/src/case-summary/get-member-case-summaries.test.ts",
      "packages/domain-member/src/index.ts",
      "apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx",
      "apps/web/src/components/dashboard/case-summary/case-kind-registry.ts",
      "apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T-116-CASE-SUMMARY`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
