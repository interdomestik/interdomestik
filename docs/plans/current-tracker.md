---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-29
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID           | Status      | Owner      | Work                                              | Exit Criteria                                       |
| ------------ | ----------- | ---------- | ------------------------------------------------- | --------------------------------------------------- |
| `T117B-DATA` | `completed` | `platform` | Request-scoped identity; exactly two projections. | Exact contract merged, verified, closed, unmounted. |

## Proof Ledger

| ID           | Source Refs                                                                                         | Execution  | Run ID                | Run Root               | Sonar  | Docker           | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------- | ---------- | --------------------- | ---------------------- | ------ | ---------------- | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T117B-DATA` | [gate](./2026-08-28-t117b-data-design-gate.md); [admission](./2026-08-28-t117b-data-admission.json) | `scripted` | `PR #1658 / 124ec51c` | `GitHub-hosted Ubuntu` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | Promotion `#1661`; product head `b9e735535ae812c0824ecb7e7a874fe78e78303d`, tree `728768ab05bc47a0f1cb25ec78ed6a6444264ffc`, squash `124ec51cefd022dd7103a4f958cb9ebef5427dad`; exact-head CI/E2E/Sonar/security/review and main health green. |

## Next Selection

T117B-DATA completed through exact re-promotion PR `#1661` and product PR `#1658`. No slice is
promoted or runtime-authorized. T117B-PORTAL is the next unpromoted candidate and must consume this
exact DATA product merge plus deterministic closeout evidence; CUTOVER remains default-denied.

| Future UI branch | Status                        | Constraint                       |
| ---------------- | ----------------------------- | -------------------------------- |
| `T117B-PORTAL`   | `design_gate_next_unpromoted` | Separate exact promotion.        |
| `T117B-CUTOVER`  | `deferred`                    | Exact PORTAL merge + closeout.   |
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
