---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-25
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Lean runtime is
> resolved only from the agreeing canonical JSON projection and live Git/GitHub facts.

## Active Queue

| ID                                  | Status        | Owner      | Work                                        | Exit Criteria                                                                                                       |
| ----------------------------------- | ------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP` | `in_progress` | `platform` | Install repo-native Lean Tier-1/2 authority | Exact candidate approval, implementation PR, protected-main health, deterministic inactive projection, and cleanup. |

## Proof Ledger

| ID                                  | Source Refs                                                                                                            | Execution | Run ID      | Run Root         | Sonar     | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- | ----------- | ---------------- | --------- | ---------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP` | [design](./2026-08-25-lean-tier12-authority-design.md); [admission](./2026-08-25-lean-tier12-authority-admission.json) | `pending` | `candidate` | `clean-worktree` | `pending` | `not_applicable` | `not_applicable` | `pending` | Focused validator, conformance, exact Git identity, fail-closed classification, mechanical certificate, exact-head CI, and closeout proof are required. |

## Next Selection

No product successor is promoted. Bootstrap installs the validator in an inactive state. A later
Tier-0 promotion PR must bind one exact Tier-1/2 gate, admission, downstream writer-map,
continuation branch, and deterministic success/failure closeout map.

| Future UI branch | Status                        | Constraint                                                                                  |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `T-118`          | `design_gate_next_unpromoted` | Consolidate the existing design system before `T-117`; no branch, activation, or UI change. |

## Lean Authority

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
