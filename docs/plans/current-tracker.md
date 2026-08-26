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

| ID                                    | Status      | Owner      | Work                                    | Exit Criteria                                     |
| ------------------------------------- | ----------- | ---------- | --------------------------------------- | ------------------------------------------------- |
| `IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` | `completed` | `platform` | Cut over the minimal public entry door. | Merged, exact-tree verified, inactive, contained. |

## Proof Ledger

| ID                                    | Source Refs                                                                                                    | Execution  | Run ID                 | Run Root               | Sonar  | Docker           | Sentry           | Learning         | Evidence Refs                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------- | ---------------------- | ------ | ---------------- | ---------------- | ---------------- | -------------------------------------------------------------------------- |
| `IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` | [gate](./2026-08-25-t118-design-system-design.md); [admission](./2026-08-25-t118-design-system-admission.json) | `scripted` | `PR #1634 / 92abb4ba4` | `GitHub-hosted Ubuntu` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | Exact head/tree, nine required checks, full E2E, pilot, and main verified. |

## Next Selection

No slice is promoted or runtime-authorized. IDA-UI07 completed through exact product PR `#1634`;
its bounded legacy `t118-promotion` allocation is consumed and cannot fund T-118. Pricing and the
active E2E contracts remained unchanged.

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
  "lifecycle": "inactive",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": null
}
```

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:null`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

WF01 remains closed and recoverable from its stable closeout, projection, envelope, receipt, and
durable evidence; none is a Lean activation input. OD17 and CI01/A1 remain unchanged, separate,
and unpromoted.
