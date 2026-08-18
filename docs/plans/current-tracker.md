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

| ID                                             | Status    | Owner                         | Work                                                       | Exit Criteria                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | --------- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `pending` | `platform + performance + qa` | Fail-closed exact-head proof of OD#17 public-shell budgets | DG47 remains the sole outcome. The DG49-A1 first-party collector prerequisite completed in [PR #1589](https://github.com/interdomestik/interdomestik/pull/1589), exact head `b71fdc52aadb5b4e3259832205a685b898f73e65`, merged as `6a835b8942202dab30d4f4193b34c32634f34320`. OD#17 is not yet proved; replacement exact-main performance-proof runtime authority remains mandatory. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` | `gate:feb4fa42`; `capability:6b66ffdf`; `correction-r2:0382428a`; `collector-pr:1589`; `collector-e2e:32131335010` | `pending` | `pending` | `pending` | `pending` | `not_applicable` | `not_applicable` | `pending` | Collector prerequisite PR `#1589` and exact-head PR E2E run `32131335010` passed. CI, Sonar (zero PR issues), CodeQL, security, Copilot and finalizer also passed. Automatic CD `32132805756` was cancelled with zero jobs/effects. These are prerequisite source references only; the OD#17 performance execution, run root and Sonar result remain pending. |

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
