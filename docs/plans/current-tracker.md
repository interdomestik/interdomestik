---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-21
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Child leases are
> resolved from the approved envelope and durable external authority, never inferred from prose.

## Active Queue

| ID                               | Status        | Owner      | Work                               | Exit Criteria                                                                                                                                                                                          |
| -------------------------------- | ------------- | ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `in_progress` | `platform` | Materialize B0 authority bootstrap | Exact approved artifacts and deterministic receipt merge from the admitted eleven-path map; B0 exact-main health/CD containment/cleanup pass; external fsync ledger consumes B0 and activates only B1. |

## Proof Ledger

| ID                               | Source Refs                                                                                                                                    | Execution | Run ID    | Run Root  | Sonar     | Docker           | Sentry           | Learning  | Evidence Refs                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- | --------- | --------- | ---------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `docs/plans/2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md`; `docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json` | `manual`  | `pending` | `pending` | `pending` | `not_applicable` | `not_applicable` | `pending` | `docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json`; `docs/plans/current-program.md`; `docs/plans/current-tracker.md` |

## Next Selection

B0 alone is directly authorized by the exact human event. Repository projection remains
`runtime_authorized:false`, `activeSlice:null` until B0 merges healthy and the separately
preauthorized external initializer durably consumes B0 and activates only B1. Every later child is
sequential, single-use, and fail-closed. No unrelated slice, PR, or historical program is promoted.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:false`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the content-addressed archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

OD17 and CI01/A1 remain unchanged, separate, and unpromoted; detailed workflow proof belongs in
the approved gate/envelope, the deterministic B0 receipt, and later stable closeout evidence.
