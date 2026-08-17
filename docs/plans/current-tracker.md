---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-17
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                              | Status      | Owner                                     | Work                                         | Exit Criteria                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ----------- | ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` | `completed` | `platform + product + accessibility + qa` | Pending null-session public-entry continuity | [PR #1581](https://github.com/interdomestik/interdomestik/pull/1581) merged as `2ce06b1bb51e451982a6a3e065b40b4e4d502536`. Exact PR and main E2E passed on GitHub Ubuntu; DG46-A1/Runtime R2 are consumed. SonarCloud Automatic Analysis did not publish its main check-run; gate timeout is classified external provider/workflow friction, with no quality finding. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` | `DG46-A1`; Runtime R2; `e2e:32036328684`; `main-ci:32038377966` | `manual` | `PR #1581` | `main@2ce06b1bb51e451982a6a3e065b40b4e4d502536` | `not_applicable` | `not_applicable` | `not_applicable` | `pass` | Corrected behavior passed focused proof, PR E2E, finalizer, and main E2E. Automatic CD `32038377959` was canceled before jobs. Sonar main gate `32038377975` timed out awaiting a missing Automatic Analysis check-run; no quality finding was reported. |

## Next Selection

No implementation slice is promoted. The next selection starts with the remaining T-115 OD#17
performance proof; dependent `T-118` and `T-117` remain blocked until a fresh design gate and
that proof complete.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

The next active governed implementation goal is blocked pending fresh current authority; `activeSlice=null`.
