---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-18
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for current program work.

## Active Queue

| ID                                             | Status    | Owner                         | Work                                                       | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | --------- | ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `pending` | `platform + performance + qa` | Fail-closed exact-head proof of OD#17 public-shell budgets | DG47 remains the sole outcome. DG49 created the OIDC Preview capability; exact-approved [DG49-A1 R2](./2026-08-18-ida-dg49-a1-t115-od17-canary-collector-correction.md), 17,454 bytes / SHA-256 `0382428a5df48152e61b3d0c468049722fa24a0251f8414153341edab2e5a71a`, authorizes only the missing first-party collector prerequisite. Corrective runtime remains unauthorized; a fresh exact-main receipt is mandatory. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `gate:feb4fa42`; `capability:6b66ffdf`; `correction-r2:0382428a`; `provider-action:d4227474` | `pending` | `pending` | `main@70ab50a073c56045ff57433d04732fdf231b13d9` | `not_applicable` | `not_applicable` | `not_applicable` | `pending` | DG49-A1 R2 is docs-only corrective authority; current-head Codex P1 is addressed and no final model PASS is claimed. It grants no runtime and is not OD#17 performance proof. |

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
