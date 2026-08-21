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

| ID                           | Status    | Owner           | Work                                                        | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | --------- | --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI01-PR-UNIT-SHADOW-A1` | `pending` | `platform + qa` | Converge PR unit shadow and coverage-completeness authority | Canonical R2 gate `d4ac2815…` and admission V2 `cc504ebb…` merged by PR #1608 from reviewed head `59eb7527…` to `main@eaa9bd10…`; exact-main health and CD containment passed. Exact-approved repair gate `762085e8…` owns only the stale proof-ledger identity and exact R2 branch/worktree cleanup. Runtime remains unauthorized; after returned-main health, containment, cleanup, and hygiene, a separately drafted/approved R2 runtime receipt is required before semantic work. No prototype transfer, test skipping, E2E change, provider/runtime operation, or A2 activation is authorized. |

## Proof Ledger

| ID                           | Source Refs                                                                                                                | Execution | Run ID    | Run Root                                        | Sonar  | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- | --------- | ----------------------------------------------- | ------ | ---------------- | ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI01-PR-UNIT-SHADOW-A1` | `dg01-r2:d4ac2815`; `admission-a1-v2:cc504ebb`; `repair-r1:762085e8`; `pr:1608`; `reviewed-head:59eb7527`; `main:eaa9bd10` | `pending` | `pending` | `main@eaa9bd108f29ce386b185c46b8474ee1c3747774` | `pass` | `not_applicable` | `not_applicable` | `pending` | Canonical R2 gate and admission; PR #1608 exact-head checks; exact-main SonarCloud, sonar-gate, CodeQL JavaScript/Actions, and gitleaks success; contained `cd.yml` run `32482906284` terminal cancelled with runner null and steps empty. Repair gate owns only identity and cleanup convergence. Admission checker remains `ready`; no A1 implementation or runtime proof is claimed. |

## Next Selection

Only `IDA-CI01-PR-UNIT-SHADOW-A1` is promoted to `awaiting_runtime_authority` under the canonical
R2 gate and A1 admission V2. `runtime_authorized:false`, `activeSlice:null`; repair R1 authorizes
only proof-ledger identity and exact R2 cleanup convergence. Semantic implementation, prototype
transfer, test skipping, E2E changes, provider/runtime operations, and A2 activation remain
forbidden pending healthy returned repair main, completed cleanup/hygiene, and one separately
drafted/approved content-addressed A1 R2 runtime receipt. Historical T-115 OD#17 remains terminal
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
