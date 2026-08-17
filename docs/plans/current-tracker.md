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

| ID                                             | Status    | Owner                         | Work                                                       | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | --------- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `pending` | `platform + performance + qa` | Fail-closed exact-head proof of OD#17 public-shell budgets | Arben approved DG47 at 11,080 bytes / SHA-256 `feb4fa420377368ebd4686d934d7f6368af9f65444d024d97d76c3662f0efae5`, bound to `main@4b2da57cfb872ee557b034fe44693ca67992bd98`. The reviewed gate is [IDA-DG47](./2026-08-17-ida-dg47-t115-od17-public-shell-performance-proof.md). Runtime remains unauthorized; a fresh exact-head non-production target canary and separate exact-main runtime receipt are mandatory before implementation. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `gate:feb4fa42`; `admission:213bb745`; `review:cd3edba8`; `z620-readiness` | `pending` | `pending` | `main@4b2da57cfb872ee557b034fe44693ca67992bd98` | `not_applicable` | `not_applicable` | `not_applicable` | `pending` | One Tier 3 authority gate only; Sol High re-review PASS. Z620 readiness showed 35,674,914,816 free disk bytes and 28,013,821,952 available memory bytes. It is not OD#17 performance proof. |

## Next Selection

Only `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` is promoted, with runtime unauthorized.
Dependent `T-118` and `T-117` remain blocked until OD#17 is actually PASS, merged and closed.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` (Tier 3; `runtime_authorized:false`).
