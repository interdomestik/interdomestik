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

| ID                                  | Status      | Owner                                     | Work                     | Exit Criteria                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------- | ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-P0A-CANONICAL-FRONT-DOOR` | `completed` | `platform + product + accessibility + qa` | Canonical front-door P0A | [Closeout](./2026-08-17-ida-t115-p0a-canonical-front-door-closeout.md): PR `#1577`, exact head `39a5fb07c3c56991cabfcb7bd15d2415d193c419`, squash merge `70c7c1f324fa3ddd8d6da7d21f31dc5df13aca34`. The locale root now has one canonical runtime composition; T-115 skeleton/OD#17 residual remains unpromoted. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-P0A-CANONICAL-FRONT-DOOR` | `docs/plans/2026-08-17-ida-t115-p0a-canonical-front-door-dg45.md`; `docs/plans/2026-08-17-ida-dg45-a1-t115-p0a-canonical-id-correction.md`; `docs/plans/2026-08-17-ida-t115-p0a-canonical-front-door-closeout.md`; `runtime:4ab58731`; `pr:1577`; `head:39a5fb07`; `merge:70c7c1f3`; `e2e:32017467272`; `main-ci:32019113834` | `scripted` | `32017467272`; `32019113834` | `main@70c7c1f324fa3ddd8d6da7d21f31dc5df13aca34` | `pass` | `not_applicable` | `not_applicable` | `pass` | Opus 5 `REVISE` followed by one consolidated remediation and exact-artifact `PASS`; one exact-head full PR E2E; Sonar, CodeQL, security, finalizer and exact-main evidence recorded in the closeout. |

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
