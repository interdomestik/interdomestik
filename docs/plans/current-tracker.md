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

| ID                                              | Status    | Owner                                     | Work                             | Exit Criteria                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | --------- | ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` | `pending` | `platform + product + accessibility + qa` | Neutral session-pending skeleton | [DG46-R1](./2026-08-17-ida-dg46-t115-p0b-neutral-session-pending-skeleton.md): exact-approved 11,808 B / SHA `2d67308c`, base `392079fd`. P0A [closeout](./2026-08-17-ida-t115-p0a-canonical-front-door-closeout.md) remains historical. No runtime/product/deploy authority until separately exact-main approved. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` | `docs/plans/2026-08-17-ida-dg46-t115-p0b-neutral-session-pending-skeleton.md`; `admission:format-only-R1`; `review:Sonnet-4.6-PASS-205351ms` | `pending` | `pending` | `main@392079fd0e0f4bc670c1bee6a2b85250670c776c` | `pending` | `not_applicable` | `not_applicable` | `pass` | Exactly one P0B outcome, three product/test writers and no special proof environment. R1 changes only Markdown table spacing; the completed semantic review remains applicable. Opus output was unrecoverable tooling evidence and was not counted. |

## Next Selection

The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-P0B-NEUTRAL-SESSION-PENDING-SKELETON` (Tier 2 product/UI/accessibility; `runtime_authorized:false`; exact-approved DG46-R1 pending docs-only merge and then a separate exact-main runtime receipt/approval).

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.
