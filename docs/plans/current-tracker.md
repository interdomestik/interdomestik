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

| ID                           | Status    | Owner           | Work                                                        | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------- | --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI01-PR-UNIT-SHADOW-A1` | `pending` | `platform + qa` | Converge PR unit shadow and coverage-completeness authority | DG01 (24,114 bytes; SHA-256 `3780375e7785e950abb60157a6a7803cfa5d40a92c34c3c625d20a91f1f90848`) and A1 admission V1 (28,801 bytes; SHA-256 `202f0fb34dc23db9b00fedb6dad45cf2984ed43766686efa27b312a22775d5cc`) are exact-approved on `main@faae32d2af477c44d2f2fed6ad36151d08b8ea8d`. Runtime is unauthorized; healthy exact Phase-A main and a separately approved content-addressed A1 runtime receipt are required before any semantic writer. No prototype transfer, test skipping, E2E change, provider/runtime operation, or A2 activation is authorized. |

## Proof Ledger

| ID                           | Source Refs                                                    | Execution | Run ID    | Run Root                                        | Sonar            | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------- | --------- | --------- | ----------------------------------------------- | ---------------- | ---------------- | ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI01-PR-UNIT-SHADOW-A1` | `dg01:3780375e`; `admission-a1:202f0fb3`; `base/main:faae32d2` | `pending` | `pending` | `main@faae32d2af477c44d2f2fed6ad36151d08b8ea8d` | `not_applicable` | `not_applicable` | `not_applicable` | `pending` | `docs/plans/2026-08-20-ida-ci-dg01-pr-unit-selection.md`; `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-admission-v1.json`; admission checker `ready` with one outcome, twelve semantic writers, three proof surfaces, one shared runtime consumer, and one special proof environment. No implementation or runtime proof is claimed. |

## Next Selection

Only `IDA-CI01-PR-UNIT-SHADOW-A1` is promoted to `awaiting_runtime_authority` under the
exact-approved DG01 and A1 admission V1. `runtime_authorized:false`, `activeSlice:null`;
Phase A authorizes only governance convergence. Semantic implementation, prototype
transfer, test skipping, E2E changes, provider/runtime operations, and A2 activation remain
forbidden pending healthy exact Phase-A main and one separately approved content-addressed
A1 runtime receipt. Historical T-115 OD#17 remains terminal
`INCONCLUSIVE — measurement_capability_missing/provider_failure`; its Child-A path remains
`NOT_RUN — strategic_stop_before_R1_A`, terminated without retry or relabel. Its successors
and the CI program's A2 remain blocked; none is automatically promoted.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-CI01-PR-UNIT-SHADOW-A1` (Tier 3; `runtime_authorized:false`).
