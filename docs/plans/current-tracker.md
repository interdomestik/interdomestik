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

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID           | Status        | Owner      | Work                                              | Exit Criteria                        |
| ------------ | ------------- | ---------- | ------------------------------------------------- | ------------------------------------ |
| `T117B-DATA` | `in_progress` | `platform` | Request-scoped identity; exactly two projections. | Promote → implement → merge → close. |

## Proof Ledger

| ID           | Source Refs                                                                                         | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T117B-DATA` | [gate](./2026-08-28-t117b-data-design-gate.md); [admission](./2026-08-28-t117b-data-admission.json) | `pending` | `PR #1661` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | `#1659` closed authority at `1b95995fbe20ddaf493099bd16976d1d876958ee`; `#1660` merged the exact capacity correction at `c98f727750a4cfc4cc632f2980d7f847ebb19269`; `#1661` re-promotion pending; no product merge. |

## Next Selection

PR `#1660` merged the exact global-derived capacity correction after fail-closed PR `#1659`. PR
`#1661` alone re-promotes unchanged ten-path DATA from the corrected protected main; runtime awaits
exact merge. Product PR `#1658` remains unmerged. PORTAL and CUTOVER remain default-denied by
predecessor proof.

| Future UI branch | Status     | Constraint                       |
| ---------------- | ---------- | -------------------------------- |
| `T117B-PORTAL`   | `deferred` | Exact DATA merge + closeout.     |
| `T117B-CUTOVER`  | `deferred` | Exact PORTAL merge + closeout.   |
| `T-117C`         | `deferred` | cacheComponents/PPR/named slots. |

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
    "promotionPrNumber": 1661,
    "promotionBaseSha": "c98f727750a4cfc4cc632f2980d7f847ebb19269",
    "expectedProductBranch": "codex/t117b-data",
    "gateSha256": "357d2fdb15bf80850547748d3912e49215d595a5081a09e588264105c3c87a28",
    "admissionSha256": "39986787cd5fdec062a77e3f278b2906b857af1f6ddc4055043dd25c4bea3429",
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

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
