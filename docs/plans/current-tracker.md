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

| ID                               | Status        | Owner      | Work               | Exit Criteria                                                                                                                           |
| -------------------------------- | ------------- | ---------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `in_progress` | `platform` | S3 exact authority | Exact projection, B/H/T/M, terminal lanes, merge/main health, authority consumption, and task-owned cleanup agree; only S4A may follow. |

## Proof Ledger

| ID                               | Source Refs                                                                                                                                                                                                                      | Execution | Run ID   | Run Root             | Sonar     | Docker           | Sentry           | Learning | Evidence Refs                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | -------------------- | --------- | ---------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | Gate `8ccebfa2b9c622f217c971cb9995506edb91091eab93aeccbbb71b0f68dc1015`; envelope `46eee3be937bb82f3bc0055f1a7bc697a08484498b197a1475bae33d760be8a6`; receipt `a6491e167ab12894d43e62ca279169cbcc4c0faf871ab116991a0eb7b4e37d03` | `manual`  | `S3-R20` | `codex-control-host` | `pending` | `not_applicable` | `not_applicable` | `pass`   | Protected main `0ea6f19f50f67a02f0ee00ace2aee51b86d0006e`; operation `06ca0e82cf252cf1d49382f6cde847b00d0aa40f6fb50b8f377f11ace15e1add`; exact projection/B-H-T-M evidence pending |

## Next Selection

B0, B1, S1A, S1B, and S2 are terminal and consumed. Revision 20 makes
`S3-exact-authority` the sole active child. S3 must prove the approved projection and exact
B/H/T/M plus terminal lane identities, then consume its lease on merge, close, or terminal
failure. S4A remains blocked until exact protected-main health and task-owned cleanup are green;
S4B and all unrelated work remain blocked behind S4A.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:true`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

OD17 and CI01/A1 remain unchanged, separate, and unpromoted; detailed workflow proof belongs in
the approved gate/envelope, the deterministic B0 receipt, and later stable closeout evidence.
