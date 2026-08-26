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

| ID                                    | Status        | Owner      | Work                                    | Exit Criteria                                                   |
| ------------------------------------- | ------------- | ---------- | --------------------------------------- | --------------------------------------------------------------- |
| `IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` | `in_progress` | `platform` | Cut over the minimal public entry door. | Exact promotion, two-path product merge, and two-path closeout. |

## Proof Ledger

| ID                                    | Source Refs                                                                                                    | Execution | Run ID     | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | -------------------------------------------------------------------- |
| `IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` | [gate](./2026-08-25-t118-design-system-design.md); [admission](./2026-08-25-t118-design-system-admission.json) | `pending` | `PR #1633` | `GitHub-hosted Ubuntu` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Legacy allocation handles rebound solely to IDA-UI07; runtime waits. |

## Next Selection

`IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` is the sole promoted successor in Tier-0 PR `#1633`.
The existing `t118-promotion` artifact-path allocation is consumed only by IDA-UI07, with no new
capacity or ceiling change. Its product writer map stays `page.tsx` plus `page.test.tsx`; Pricing
and active E2E contracts remain unchanged. Product implementation waits for repo authorization.

| Future UI branch | Status                        | Constraint                                                                  |
| ---------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `T-118`          | `design_gate_next_unpromoted` | Its former reserve is consumed by IDA-UI07; reevaluate capacity separately. |
| `T-117`          | `deferred`                    | Remains behind T-118; no branch, activation, or shared-shell edit.          |

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
    "sliceId": "IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER",
    "tier": 2,
    "promotionPrNumber": 1633,
    "promotionBaseSha": "b7284c35b79d1d5ee1b09a674da4f6bbd9a0c7b2",
    "expectedProductBranch": "codex/ida-ui07-minimal-entry-door-cutover",
    "gateSha256": "3a823c44670a6b288cd19eafe48fb5dc35029bd0df45f52a185ba64c0e27c95a",
    "admissionSha256": "b0624971e94d4a4b9fb086bfb5cdd139cbecdc7517e51aa1ffa8ccfebbfef3cd",
    "productWriterPaths": [
      "apps/web/src/app/[locale]/page.tsx",
      "apps/web/src/app/[locale]/page.test.tsx"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
