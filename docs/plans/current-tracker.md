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

> Authority: This document defines the single current queue/proof projection. Lean runtime is
> resolved only from the agreeing canonical JSON projection and live Git/GitHub facts.

## Active Queue

| ID           | Status    | Owner      | Work                                                | Exit Criteria                             |
| ------------ | --------- | ---------- | --------------------------------------------------- | ----------------------------------------- |
| `T117B-DATA` | `blocked` | `platform` | Request-scoped context and exactly two projections. | PR `#1655` merged; fresh exact promotion. |

## Proof Ledger

| ID           | Source Refs                                                                                         | Execution | Run ID                 | Run Root               | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- | --------- | ---------------------- | ---------------------- | --------- | ---------------- | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `T117B-DATA` | [gate](./2026-08-28-t117b-data-design-gate.md); [admission](./2026-08-28-t117b-data-admission.json) | `blocked` | `PR #1654`; `PR #1655` | `GitHub-hosted Ubuntu` | `missing` | `not_applicable` | `not_applicable` | `not_applicable` | Initial promotion closed; exact four-path budget rebind merged at `43cf38e1fb64a888077d62313ba4dcfd011dcd08`; no product PR. |

## Next Selection

T-116 remains terminally complete. Prerequisite PR `#1653` installed the bounded sequential
authority without product runtime. Promotion PR `#1654` merged root child `T117B-DATA` at
`d2f79f26f13bab9e586fd02d3c3b90f3d1593d5a`, but exact implementation sizing exposed four
per-path allocation mismatches before product commit, push, or PR. Budget-only PR `#1655` then
rebound exactly those four existing per-path ceilings and merged at
`43cf38e1fb64a888077d62313ba4dcfd011dcd08`, without changing aggregate, category, file, or global
ceilings. Authority is inactive while a fresh exact ten-path promotion is prepared. PORTAL and
CUTOVER remain default-denied by predecessor proof.

| Future UI branch | Status     | Constraint                                                      |
| ---------------- | ---------- | --------------------------------------------------------------- |
| `T117B-PORTAL`   | `deferred` | Requires exact DATA product merge and deterministic closeout.   |
| `T117B-CUTOVER`  | `deferred` | Requires exact PORTAL product merge and deterministic closeout. |
| `T-117C`         | `deferred` | Atomically owns cacheComponents, PPR, and named route slots.    |

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
