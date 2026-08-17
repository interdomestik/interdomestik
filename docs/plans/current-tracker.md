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

| ID                                  | Status        | Owner                                     | Work                     | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------- | ----------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-P0A-CANONICAL-FRONT-DOOR` | `in_progress` | `platform + product + accessibility + qa` | Canonical front-door P0A | Exact-approved [IDA-DG45](./2026-08-17-ida-t115-p0a-canonical-front-door-dg45.md) is 16,491 bytes / SHA-256 `faed90a14251220b2092a830a8f44696d54877534ca9573e5aa699e2d5f3bc2e`; [IDA-DG45-A1](./2026-08-17-ida-dg45-a1-t115-p0a-canonical-id-correction.md) is 4,379 bytes / SHA-256 `601ec770a7ab9fb9b0f6178767fadb0e6667bd8cf45a724864a33e2047b3cd70` and corrects only `P0a` to `P0A`; runtime remains separately gated. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-P0A-CANONICAL-FRONT-DOOR` | `docs/plans/2026-08-17-ida-t115-p0a-canonical-front-door-dg45.md`; `docs/plans/2026-08-17-ida-dg45-a1-t115-p0a-canonical-id-correction.md`; `gate:faed90a1`; `a1:601ec770`; `admission:138e2e50`; `uiux:c18f5ad3`; `review:904f4106` | `manual` | `codex/ida-dg45-t115-authority` | `main` | `not_applicable` | `not_applicable` | `not_applicable` | `pass` | Exact gate/A1 approvals and review disposition recorded; separate runtime receipt required after merge. |

## Next Selection

The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-P0A-CANONICAL-FRONT-DOOR` (Tier 2 product/UI/accessibility; `runtime_authorized:false`; immutable `IDA-DG45` plus exact-approved identifier correction `IDA-DG45-A1` pending docs-only merge).

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.
