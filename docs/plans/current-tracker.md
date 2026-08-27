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

| ID                            | Status        | Owner      | Work                         | Exit Criteria          |
| ----------------------------- | ------------- | ---------- | ---------------------------- | ---------------------- |
| `T-117A-UNIFIED-PORTAL-SHELL` | `in_progress` | `platform` | Presentational portal shell. | Promote, merge, close. |

## Proof Ledger

| ID                            | Source Refs                                                                                                                         | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ---------------------------------------- |
| `T-117A-UNIFIED-PORTAL-SHELL` | [gate](./2026-08-27-t117a-unified-portal-shell-design-gate.md); [admission](./2026-08-27-t117a-unified-portal-shell-admission.json) | `pending` | `PR #1641` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Promotion and five-path product pending. |

## Next Selection

PR `#1641` projects T-117A only after exact branch/base/head validation and promotion merge.

| Future UI branch | Status     | Constraint                                  |
| ---------------- | ---------- | ------------------------------------------- |
| `T-117B`         | `deferred` | Runtime architecture needs a separate gate. |

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
    "sliceId": "T-117A-UNIFIED-PORTAL-SHELL",
    "tier": 2,
    "promotionPrNumber": 1641,
    "promotionBaseSha": "438ea3f51f68789743bf6d3882c5a423e9593629",
    "expectedProductBranch": "codex/t117a-unified-portal-shell",
    "gateSha256": "f5cb1188e81462a7b4fcb0e5fc4e5c2b3da971f974381fd1ebce9810fee039c0",
    "admissionSha256": "1cec50454b9c54e76b4f74d2dd20b570cc696f4d4222eb61a14eca227b69f306",
    "productWriterPaths": [
      "packages/ui/src/components/crystal/unified-portal-shell.tsx",
      "packages/ui/src/components/crystal/index.ts",
      "packages/ui/src/components/crystal/crystal.stories.tsx",
      "packages/ui/src/index.ts",
      "apps/web/src/components/dashboard/unified-portal-shell.test.tsx"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T-117A-UNIFIED-PORTAL-SHELL`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
