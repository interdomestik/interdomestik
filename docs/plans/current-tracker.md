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

| ID                         | Status      | Owner      | Work                    | Exit Criteria                                          |
| -------------------------- | ----------- | ---------- | ----------------------- | ------------------------------------------------------ |
| `T-118-CRYSTAL-PRIMITIVES` | `completed` | `platform` | Add Crystal primitives. | Exact ten paths merged, verified, inactive, contained. |

## Proof Ledger

| ID                         | Source Refs                                                                                                                   | Execution  | Run ID                | Run Root               | Sonar  | Docker           | Sentry           | Learning         | Evidence Refs                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- | ---------------------- | ------ | ---------------- | ---------------- | ---------------- | ----------------------------------------------------------------------------- |
| `T-118-CRYSTAL-PRIMITIVES` | [gate](./2026-08-26-t118-crystal-primitives-design-gate.md); [admission](./2026-08-26-t118-crystal-primitives-admission.json) | `scripted` | `PR #1638 / 79defe7a` | `GitHub-hosted Ubuntu` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | Exact head/tree, nine required checks, full E2E, pilot, and browser verified. |

## Next Selection

T-118 completed through exact promotion PR `#1637` and product PR `#1638`. No slice is promoted or
runtime-authorized; T-117 is the next design-gate candidate and requires separate promotion.

| Future UI branch | Status                        | Constraint                                  |
| ---------------- | ----------------------------- | ------------------------------------------- |
| `T-117`          | `design_gate_next_unpromoted` | No branch or shared-shell edit before gate. |

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
