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

| ID           | Status    | Owner      | Work                                              | Exit Criteria                       |
| ------------ | --------- | ---------- | ------------------------------------------------- | ----------------------------------- |
| `T117B-DATA` | `blocked` | `platform` | Request-scoped identity; exactly two projections. | Exact correction → fresh promotion. |

## Proof Ledger

| ID           | Source Refs                                                                                         | Execution | Run ID                 | Run Root               | Sonar  | Docker           | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------- | --------- | ---------------------- | ---------------------- | ------ | ---------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T117B-DATA` | [gate](./2026-08-28-t117b-data-design-gate.md); [admission](./2026-08-28-t117b-data-admission.json) | `blocked` | `PR #1657`; `PR #1658` | `GitHub-hosted Ubuntu` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | `#1657` merged promotion at `4f9fe1511025f72fd9723983049ab5497c25bfc0`; `#1658` head `14c8ad8871f931680c826e62b44b926f6333b610`, tree `2c91b495998c95360771082d6dad2ddd956f813f`, exposed bounded aggregate/category capacity; no product merge. |

## Next Selection

PR `#1657` merged the unchanged ten-path DATA promotion. Product PR `#1658` proved the exact
product/E2E surface but is intentionally unmerged after the bounded capacity deficit. Authority is
inactive while the exact global-derived budget correction and fresh promotion are prepared. PORTAL
and CUTOVER remain default-denied by predecessor proof.

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
