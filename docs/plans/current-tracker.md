---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-19
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                | Status    | Owner                         | Work                                                  | Exit Criteria                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | --------- | ----------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-FINAL-MEASUREMENT` | `pending` | `platform + performance + qa` | Final exact-head OD#17 Preview/canary measurement     | Capability merged green in [PR #1598](https://github.com/interdomestik/interdomestik/pull/1598): head `2a32a18e`, merge `858eb4a3`; exact main healthy; CD `32266432820` canceled before jobs. Await the sole DG51 measurement receipt. Then one Preview, canary, audit/finalizer rerun and exact-head closeout; no retry or alternate provider.                           |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-FINAL-MEASUREMENT` | `dg51:9a6b755c`; `pr:1598`; `head:2a32a18e`; `merge/main:858eb4a3`; `main-ci:32266432831`; `main-sonar:32266432804`; `cd:32266432820` | `pending` | `pending` | `main:858eb4a3` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/2026-08-19-ida-dg51-t115-od17-projection-capability.md`; `https://github.com/interdomestik/interdomestik/pull/1598` |

## Next Selection

Only `IDA-T115-OD17-FINAL-MEASUREMENT` is promoted, but it is not runtime-authorized.
The resolver is `awaiting_runtime_authority` on exact main
`858eb4a32fc47ef9cdd04fbc1e44e10da630ba76`. No measurement branch, provider
control, Preview or canary may begin before exact approval of the sole DG51
final-measurement receipt. If approved, follow DG51 Phase B/C exactly once: merge only
on PASS; on any non-PASS close unmerged and stop. Dependent `T-118`, `T-117` and
`T-116` remain blocked until OD#17 is PASS and closed.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-OD17-FINAL-MEASUREMENT` (Tier 3 one-shot protected-main performance measurement; `runtime_authorized:false`; resolver `awaiting_runtime_authority` pending the sole separate exact-main receipt permitted by `IDA-DG51-T115-OD17-PROJECTION-CAPABILITY-R1`).
