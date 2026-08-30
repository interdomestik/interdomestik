---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-30
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID             | Status      | Owner      | Work                                                        | Exit Criteria                                       |
| -------------- | ----------- | ---------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `T117B-PORTAL` | `completed` | `platform` | Unmounted Case, lifecycle Actions, and Recent case updates. | Exact contract merged, verified, closed, unmounted. |

## Proof Ledger

| ID             | Source Refs                                                                                             | Execution  | Run ID                | Run Root               | Sonar  | Docker           | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------- | ---------- | --------------------- | ---------------------- | ------ | ---------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T117B-PORTAL` | [gate](./2026-08-28-t117b-portal-design-gate.md); [admission](./2026-08-28-t117b-portal-admission.json) | `scripted` | `PR #1666 / d4edda41` | `GitHub-hosted Ubuntu` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | Promotion `#1665`; product head `2ad7708bf5b694a392e7d41e13f7e98fb2fcc5a2`, tree `368ca4056be5d14d8661b110518f5551c97b643b`, squash `d4edda418f991a4c8f4a35ef8e854d4a6efd3b33`; Full Gate `33318778916`, Pilot `33318778935`, CI `33318778926`, finalizer `33318778914`, delivery `33318778930`, and exact-main CI/Sonar/CodeQL/security green; CD `33319864323` cancelled with zero jobs. |

## Next Selection

T117B-PORTAL completed through exact promotion PR `#1665` and product PR `#1666`. No slice is
promoted or runtime-authorized. T117B-CUTOVER is the next unpromoted candidate and requires a
separate design gate and promotion that consume this exact PORTAL merge and deterministic closeout;
T-117C remains deferred.

| Future UI branch | Status                        | Constraint                       |
| ---------------- | ----------------------------- | -------------------------------- |
| `T117B-CUTOVER`  | `design_gate_next_unpromoted` | Separate exact promotion.        |
| `T-117C`         | `deferred`                    | cacheComponents/PPR/named slots. |

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

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
