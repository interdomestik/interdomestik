---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-19
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                          | Status        | Owner                         | Work                                                          | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------- | ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-PROJECTION-CAPABILITY`       | `in_progress` | `platform + performance + qa` | Inert protected-main OD#17 projection capability and verifier | Exact-approved [DG51](./2026-08-19-ida-dg51-t115-od17-projection-capability.md) `9a6b755c`, ready admission `20bc2ada`, and [runtime R1](./2026-08-19-ida-t115-od17-projection-capability-runtime-r1.md) `a295e39f` bind exact main `6cf5227f` and one capability branch/PR. Merge only a green exact reviewed head after real-payload RED/GREEN proof and required hosted checks; no provider control, Preview, canary or measurement. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PROJECTION-CAPABILITY` | `dg51:9a6b755c`; `runtime:a295e39f`; `admission:20bc2ada`; `base:6cf5227f`; `terminal:7e415da8` | `manual` | `codex/ida-t115-od17-projection-capability` | `main:6cf5227f` | `pending` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/2026-08-19-ida-dg51-t115-od17-projection-capability.md`; `docs/plans/2026-08-19-ida-t115-od17-projection-capability-runtime-r1.md` |

## Next Selection

Only the inert OD#17 projection capability is promoted and runtime-authorized. Provider
controls, Preview, canary and measurement are forbidden in this phase. After exact-head
capability merge and exact-main convergence, one separate exact-main measurement receipt
may authorize the final one-shot measurement. Dependent `T-118` and `T-117` remain
blocked until OD#17 is actually PASS, merged and closed.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-OD17-PROJECTION-CAPABILITY` (Tier 3 protected-main performance-verification capability; `runtime_authorized:true` for capability-only repository work under exact-approved `IDA-DG51-T115-OD17-PROJECTION-CAPABILITY-R1` and `IDA-T115-OD17-PROJECTION-CAPABILITY-RUNTIME-R1`; provider runtime remains unauthorized pending one separately approved exact-main final-measurement receipt).
