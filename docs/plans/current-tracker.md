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

| ID                                              | Status      | Owner           | Work                     | Exit Criteria                                                                                                                                                                                        |
| ----------------------------------------------- | ----------- | --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-CI05-PILOT-SONAR-CRITICAL-PATH-DECOUPLING` | `completed` | `platform + qa` | Most recent closed slice | [Implementation PR #1573](https://github.com/interdomestik/interdomestik/pull/1573) and [closeout PR #1574](https://github.com/interdomestik/interdomestik/pull/1574) merged; no successor promoted. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-CI05-PILOT-SONAR-CRITICAL-PATH-DECOUPLING` | `docs/plans/2026-08-15-ida-dg43-ci05-pilot-sonar-critical-path-decoupling.md`; `archive:355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78` | `manual` | `not_applicable` | `main` | `not_applicable` | `not_applicable` | `not_applicable` | `pass` | `https://github.com/interdomestik/interdomestik/pull/1573`; `https://github.com/interdomestik/interdomestik/pull/1574` |

## Next Selection

The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.
