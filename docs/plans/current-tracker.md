---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-23
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Child leases are
> resolved from the approved envelope and durable external authority, never inferred from prose.

## Active Queue

| ID                               | Status        | Owner      | Work                                 | Exit Criteria                                                                                                                                             |
| -------------------------------- | ------------- | ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `in_progress` | `platform` | S3 exact authority after S2 closeout | S2 recovery/live proof is green; this exact projection merges healthy; revisions 19/20 consume S2 and activate only S3; final resolver and cleanup agree. |

## Proof Ledger

| ID                               | Source Refs                                                                                                                                                                                                                       | Execution | Run ID  | Run Root             | Sonar            | Docker           | Sentry           | Learning | Evidence Refs                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- | -------------------- | ---------------- | ---------------- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | Gate `d55c180e64659e12f22400e1e20adc08dfa1ea2821a997b6798370ea26f3b464`; admission `abd52f22a5b266144406714048b90ef615e7c17acb76c42a451f4ebeabd41d7b`; receipt `e3353f95e703d49d8d74e238acd551ebc4f11795a7b67c50699fa9387f04329b` | `manual`  | `S2-R2` | `codex-control-host` | `not_applicable` | `not_applicable` | `not_applicable` | `pass`   | Live MCP proof `de3ef039658c40a064829b6adf607076532b16e4e7a6bef9d640636d3b0e21ff`; durable `authority-v1.json`; exact projection PR/main/cleanup evidence |

## Next Selection

B0, B1, S1A, and S1B are terminal and consumed. Revision 18 recovered only S2, and its fresh
transport plus complete worktree-identity proof is green. This exact projection is the S2 closeout
record; its exact merge, protected-main health, and task-owned cleanup are consumed by revisions
19/20, which close S2 and make `S3-exact-authority` the sole active child. Until those append-only
transitions are present, S3, S4, and all unrelated work remain blocked and fail closed.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:true`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

OD17 and CI01/A1 remain unchanged, separate, and unpromoted; detailed workflow proof belongs in
the approved gate/envelope, the deterministic B0 receipt, and later stable closeout evidence.
