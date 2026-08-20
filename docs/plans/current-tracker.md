---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-20
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                                       | Status    | Owner                         | Work                                                                | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | --------- | ----------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` | `blocked` | `platform + performance + qa` | Terminal non-execution closeout of the admitted artifact foundation | [PR #1604](https://github.com/interdomestik/interdomestik/pull/1604) merged A2 as `755c02d052999c76ccf184dfa3f6746e5b61ad52`. The child is fixed as `NOT_RUN — strategic_stop_before_R1_A`: no R1-A, semantic writer or provider/runtime action occurred. The A1/A2 Child-A execution path is terminated without retry; all successors remain blocked pending a fresh strategic decision. |

## Proof Ledger

| ID                                                       | Source Refs                                                                                   | Execution | Run ID                   | Run Root         | Sonar  | Docker           | Sentry           | Learning   | Evidence Refs                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------- | ------------------------ | ---------------- | ------ | ---------------- | ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION` | `dg52-a1:4fa5b4f6`; `dg52-a2:9710a3f0`; `admission-a-v2:12f2a2ac`; `pr:1604`; `main:755c02d0` | `blocked` | `not_run_strategic_stop` | `not_applicable` | `pass` | `not_applicable` | `not_applicable` | `recorded` | `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-artifact-foundation-failure-closeout.md`; no R1-A, semantic implementation or provider runtime occurred. Exact-main security/Sonar/CodeQL passed; CD `32361955102` had zero runner assignments and steps. GitHub retained staging metadata `6000907447` / error status `17064554416`, with no provider call. |

## Next Selection

No slice is promoted. Child A is fixed as
`NOT_RUN — strategic_stop_before_R1_A`; no R1-A was approved or materialized and its A1/A2
execution path is terminated without retry. `runtime_authorized:false`, `activeSlice:null`,
and resolver target `blocked_requires_current_authority`. Historical T-115 remains terminal
`INCONCLUSIVE — measurement_capability_missing/provider_failure` without relabel.
Deployment Confinement, Measurement Integration, R2, `T-118`, `T-117`, and `T-116` remain
blocked pending a fresh strategic decision; none is automatically promoted.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.
