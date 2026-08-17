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

| ID                                              | Status    | Owner                                     | Work                                         | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | --------- | ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` | `pending` | `platform + product + accessibility + qa` | Pending null-session public-entry continuity | [DG46-A1](./2026-08-17-ida-dg46-a1-t115-p0b-public-entry-continuity-correction.md): exact-approved 6,012 B / SHA `c52e3738`, base `1505ff84`; supersedes only DG46-R1 pending precedence after exact PR #1581 E2E failure. P0A [closeout](./2026-08-17-ida-t115-p0a-canonical-front-door-closeout.md) remains historical. No runtime/product/deploy authority until corrective docs merge and replacement exact-main approval. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` | `DG46-R1`; `docs/plans/2026-08-17-ida-dg46-a1-t115-p0b-public-entry-continuity-correction.md`; `e2e:32030795511/95390208493` | `pending` | `PR #1581` | `main@1505ff841c16d8fe41057a12e012bb27e359bf9c` | `pass` | `not_applicable` | `not_applicable` | `pending` | Exact E2E failed three built-in attempts because pending session hid the canonical public intake. DG46-A1 preserves one outcome/three writers, invalidates only E2E/finalizer/current-head review proof, and requires replacement runtime authority. No special proof environment. |

## Next Selection

The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` (Tier 2 product/UI/accessibility; `runtime_authorized:false`; exact-approved DG46-A1 public-entry continuity correction pending docs-only merge and then a replacement exact-main runtime receipt/approval).

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.
