---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-22
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Child leases are
> resolved from the approved envelope and durable external authority, never inferred from prose.

## Active Queue

| ID                               | Status        | Owner      | Work                         | Exit Criteria                                                                                                                                                                                         |
| -------------------------------- | ------------- | ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `in_progress` | `platform` | Activate S1A skill authority | R4 governance repair merges healthy; replacement receipt/ledger bind the returned main; the exact S1A bundle swaps atomically, passes focused/full skill proof, consumes S1A, and activates only S1B. |

## Proof Ledger

| ID                               | Source Refs                                                                                                                                    | Execution | Run ID | Run Root             | Sonar     | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ | -------------------- | --------- | ---------------- | ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `docs/plans/2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md`; `docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json` | `manual`  | `S1A`  | `codex-control-host` | `pending` | `not_applicable` | `not_applicable` | `pending` | `docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json`; durable `authority-v1.json`; exact S1A bundle manifests |

## Next Selection

B0 and B1 are terminal. The exact R4 human event authorizes only the cumulative heading-inheritance
and validator-reachability repair and unchanged S1A outcome. After exact R4 main health and durable
identity rebinding,
`runtime_authorized:true`, `activeSlice:S1A-skill-authority`; every later child remains sequential,
single-use, and fail-closed. No unrelated slice, PR, or historical program is promoted.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:true`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

OD17 and CI01/A1 remain unchanged, separate, and unpromoted; detailed workflow proof belongs in
the approved gate/envelope, the deterministic B0 receipt, and later stable closeout evidence.
