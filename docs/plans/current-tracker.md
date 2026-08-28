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

| ID                      | Status    | Owner      | Work                                              | Exit Criteria                                                |
| ----------------------- | --------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `T-117B-PORTAL-RUNTIME` | `pending` | `platform` | Ordinary RSC member portal runtime, no PPR/slots. | Exact Tier-3 promotion then product/closeout proof is green. |

## Proof Ledger

| ID                      | Source Refs                                                                                                             | Execution | Run ID    | Run Root  | Sonar     | Docker           | Sentry           | Learning         | Evidence Refs                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- | --------- | --------- | --------- | ---------------- | ---------------- | ---------------- | --------------------------------------------------------- |
| `T-117B-PORTAL-RUNTIME` | [gate](./2026-08-28-t117b-portal-runtime-design-gate.md); [admission](./2026-08-28-t117b-portal-runtime-admission.json) | `pending` | `pending` | `pending` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | No product implementation/PR/CI/E2E/merge/closeout proof. |

## Next Selection

T-116 remains terminally complete. T-117B is the sole pending Tier-3 candidate. Promotion PR
`#1650` is superseded for product execution after prerequisite PR `#1651` advanced protected main
to `022c6bdf28239e749e02bcfbc9245641c45bdaaa`; neither PR grants current runtime. A new exact
re-freeze and promotion are required before implementation. T-117C remains deferred until T-117B
closes.

| Future UI branch | Status     | Constraint                                                   |
| ---------------- | ---------- | ------------------------------------------------------------ |
| `T-117C`         | `deferred` | Atomically owns cacheComponents, PPR, and named route slots. |

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
