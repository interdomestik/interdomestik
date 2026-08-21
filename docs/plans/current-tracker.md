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

| ID                           | Status    | Owner           | Work                                                        | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------- | --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI01-PR-UNIT-SHADOW-A1` | `pending` | `platform + qa` | Converge PR unit shadow and coverage-completeness authority | Exact-approved R3 gate `1ee8ca30…` and admission V3 `54f80ced…` are bound to `main@7fb7180a…`. R3 corrects only the pre-PR modularity and full-unit required-audit closure defects while preserving the same 12 semantic writers and shadow-only outcome. Runtime remains unauthorized; after returned R3 main health, containment, cleanup and hygiene, a separately drafted/approved R3 runtime receipt is required before semantic work. No prototype transfer, test skipping, E2E change, provider/runtime operation, or A2 activation is authorized. |

## Proof Ledger

| ID                           | Source Refs                                                     | Execution | Run ID    | Run Root                                        | Sonar  | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------- | --------- | --------- | ----------------------------------------------- | ------ | ---------------- | ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI01-PR-UNIT-SHADOW-A1` | `dg01-r3:1ee8ca30`; `admission-a1-v3:54f80ced`; `main:7fb7180a` | `pending` | `pending` | `main@7fb7180aafadf91b79ec37f5daeebaa85bc86ff2` | `pass` | `not_applicable` | `not_applicable` | `pending` | R3 preserves 1 outcome, 12 writers, 3 proof surfaces, 1 CI workflow consumer and 1 GitHub-hosted Ubuntu environment. Deterministic proof recorded the modularity and standalone-unit branch-protection defects. No implementation or runtime proof is claimed. |

## Next Selection

Only `IDA-CI01-PR-UNIT-SHADOW-A1` is promoted to `awaiting_runtime_authority` under R3 gate and
A1 admission V3. `runtime_authorized:false`, `activeSlice:null`; R3 authorizes only governance
convergence. Semantic implementation, prototype transfer, test skipping, E2E changes,
provider/runtime operations, and A2 activation remain forbidden pending healthy returned R3 main,
completed cleanup/hygiene, and one separately drafted/approved content-addressed A1 R3 runtime
receipt. Historical T-115 OD17 remains terminal
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
