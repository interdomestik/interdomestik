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

| ID                                             | Status        | Owner                         | Work                                                                 | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------- | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `in_progress` | `platform + performance + qa` | One final B-only Deployment-projection recovery and OD#17 measurement | Arben exact-approved `IDA-T115-OD17-BRIDGE-R1`, 5,224 bytes / SHA-256 `3525c84ba4cb0bcdaedf4cf86195d72b9ea275b9796c8f1679dc2eff32543c34`, on exact main `6cf5227fcdf7247b801d9aa4673eabb08bceab98`. DG50 remains binding except for the bridge's explicitly superseded consumed clauses. It permits only `deployment_status Events=ON`, one automatic Preview, one protected-main canary and one audit/finalizer rerun after a valid content-addressed canary PASS; all successors remain blocked. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `pr:1597`; `head:6e334da0`; `tree:ce742a8a`; `e2e:32239046124`; `prepare:32239046100`; `preview:8LKKHvVpQNFiNiuC9Zi44dLVQMjP`; `canary:32240149670`; `bridge:3525c84b` | `manual` | `codex/ida-t115-od17-performance-proof` | `main` | `pass` | `not_applicable` | `not_applicable` | `not_applicable` | `IDA-T115-OD17-TERMINAL-INCONCLUSIVE-R1`; `IDA-T115-OD17-BRIDGE-R1` |

## Next Selection

Only OD#17 is runtime-authorized. Reuse/reopen PR #1597 under
`IDA-T115-OD17-BRIDGE-R1`; proceed only from one unique READY, non-production,
exact-head Preview and matching successful GitHub Deployment to one protected-main
canary. Dependent `T-118` and `T-117` remain blocked until OD#17 is actually PASS,
merged and closed.

## Historical Authority

The complete pre-compaction queue, proof ledger, and revision narratives through Rev 243
remain recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The [architecture-finalization tracker](./architecture-finalization-tracker-2026-05-29.md)
remains the stable deep-detail source for M0-M5 task contracts. Current rows are replaced at
selection, implementation and closeout; detailed proof is linked, never copied here.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker slice: `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` (Tier 3 shared performance-verification recovery; `runtime_authorized:true`; exact-approved `IDA-T115-OD17-BRIDGE-R1`).
