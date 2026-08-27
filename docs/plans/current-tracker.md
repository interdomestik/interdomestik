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

| ID                   | Status    | Owner      | Work                                   | Exit Criteria                     |
| -------------------- | --------- | ---------- | -------------------------------------- | --------------------------------- |
| `T-116-CASE-SUMMARY` | `pending` | `platform` | Safe projection and accident registry. | Promote, implement, merge, close. |

## Proof Ledger

| ID                   | Source Refs                                                                                                       | Execution | Run ID       | Run Root | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- | --------- | ---------------- | ---------------- | ---------------- | -------------------------------------------------- |
| `T-116-CASE-SUMMARY` | [gate](./2026-08-27-t116-case-summary-design-gate.md); [admission](./2026-08-27-t116-case-summary-admission.json) | `pending` | `unassigned` | `none`   | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | Pre-PR candidate only; no execution proof claimed. |

## Next Selection

T-116 is the selected unpromoted prerequisite. No slice is promoted or runtime-authorized; a live
promotion PR number must be derived after approval from the deterministic branch.

| Future UI branch | Status     | Constraint                                                   |
| ---------------- | ---------- | ------------------------------------------------------------ |
| `T-117B`         | `deferred` | Waits for T-116 closeout and a separate Tier-3 runtime gate. |

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
