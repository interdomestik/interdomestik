---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-09-08
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: single current projection; Lean runtime requires matching canonical JSON and live
> Git/GitHub facts.

## Active Queue

| ID       | Status    | Owner      | Work                               | Exit Criteria                             |
| -------- | --------- | ---------- | ---------------------------------- | ----------------------------------------- |
| `T-117C` | `blocked` | `platform` | Nonce-compatible member rendering. | Repair CI evidence pin; repeat promotion. |

## Proof Ledger

| ID       | Source Refs                                                                                                   | Execution | Run ID     | Run Root         | Sonar     | Docker           | Sentry           | Learning | Evidence Refs                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------- | --------- | ---------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `T-117C` | [gate](./2026-09-07-t117c-rendering-design-gate.md); [admission](./2026-09-07-t117c-rendering-admission.json) | `blocked` | `PR #1705` | `not_applicable` | `missing` | `not_applicable` | `not_applicable` | `pass`   | docs/plans/2026-09-07-t117c-rendering-design-gate.md; docs/plans/2026-09-07-t117c-rendering-admission.json |

Terminal evidence: re-promotion `#1691`; product head
`503d4b179251f9d3d06e07349ec80f85805565ae`, tree
`61b2316606c9b3facd6c8aff2a14bb4402d80c82`, squash
`31cae997e42dbc0bee13ca670899b988576bd42c`; Full Gate `33863200404`, CI `33863200381`, Pilot
`33863200495`, backstops `33863200850`, security `33862616690`, finalizer `33863200356` attempt 2,
delivery `33863200387` attempt 2, and exact-main CI/Sonar/CodeQL/security were green; CD
`33865541227` was cancelled with zero jobs.

## Next Selection

T117B-CUTOVER completed through exact re-promotion `#1691` and product `#1675`. T-117C promotion `#1703` merged exactly, but product PR `#1705` closed unmerged after audit exposed a required CI evidence pin outside the frozen writer map. Runtime is inactive pending bounded repair and repeat promotion. The missing compiled post-merge-node certificate remains shadow backlog evidence only.

| Future UI branch | Status     | Constraint                                      |
| ---------------- | ---------- | ----------------------------------------------- |
| `T-117C`         | `deferred` | Repair CI evidence pin; repeat exact promotion. |

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
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:null`; lifecycle `inactive`).

## Historical Authority

Pre-compaction history through Rev 243: [manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json),
SHA-256 `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`. WF01 stays
closed/non-activating; OD17 and CI01/A1 remain separate and unpromoted.
