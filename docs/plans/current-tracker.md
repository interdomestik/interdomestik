---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-26
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Lean runtime is
> resolved only from the agreeing canonical JSON projection and live Git/GitHub facts.

## Active Queue

| ID                         | Status        | Owner      | Work                    | Exit Criteria                        |
| -------------------------- | ------------- | ---------- | ----------------------- | ------------------------------------ |
| `T-118-CRYSTAL-PRIMITIVES` | `in_progress` | `platform` | Add Crystal primitives. | Promote, merge ten paths, close out. |

## Proof Ledger

| ID                         | Source Refs                                                                                                                   | Execution | Run ID            | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ------------------------------------------------- |
| `T-118-CRYSTAL-PRIMITIVES` | [gate](./2026-08-26-t118-crystal-primitives-design-gate.md); [admission](./2026-08-26-t118-crystal-primitives-admission.json) | `pending` | `candidate #1637` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Four-path promotion and ten-path product pending. |

## Next Selection

Candidate `#1637` projects T-118 only after promotion validation.

| Future UI branch | Status     | Constraint                           |
| ---------------- | ---------- | ------------------------------------ |
| `T-117`          | `deferred` | Blocked behind T-118; no shell edit. |

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
    "sliceId": "T-118-CRYSTAL-PRIMITIVES",
    "tier": 2,
    "promotionPrNumber": 1637,
    "promotionBaseSha": "6ff846deb9d99ad103d81dba5e4de46343dcf965",
    "expectedProductBranch": "codex/t118-crystal-primitives",
    "gateSha256": "91c3088b522a8e087f9872efe3b3b68f8d013ea8105830a119c3469be1cea395",
    "admissionSha256": "7c4e14b2a244ed53bb032c6b936b2dd8d3f3bf7f2ab5f5b05715b71b311970d2",
    "productWriterPaths": [
      "packages/ui/src/components/crystal/tokens.ts",
      "packages/ui/src/components/crystal/matte-anchor-card.tsx",
      "packages/ui/src/components/crystal/refractive-glass-panel.tsx",
      "packages/ui/src/components/crystal/stepper.tsx",
      "packages/ui/src/components/crystal/timeline.tsx",
      "packages/ui/src/components/crystal/index.ts",
      "packages/ui/src/components/crystal/crystal.stories.tsx",
      "packages/ui/src/index.ts",
      "apps/web/src/components/dashboard/crystal-primitives.test.tsx",
      "apps/web/src/components/dashboard/crystal-boundary.test.ts"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T-118-CRYSTAL-PRIMITIVES`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
