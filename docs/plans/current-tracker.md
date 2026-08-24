---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-24
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This document defines the single current queue/proof projection. Child leases are
> resolved from the approved envelope and durable external authority, never inferred from prose.

## Active Queue

| ID                               | Status      | Owner      | Work                                   | Exit Criteria                                                                                                                                                  |
| -------------------------------- | ----------- | ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | `completed` | `platform` | Terminal Workflow Protocol V1 closeout | S4B semantic delivery, add-only protection activation, exact-main health, CD containment, authority consumption, and cleanup are bound by the stable closeout. |

## Proof Ledger

| ID                               | Source Refs                                                                                                                                                                                                                                                                                                                      | Execution  | Run ID      | Run Root               | Sonar  | Docker           | Sentry           | Learning | Evidence Refs                                                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- | ---------------------- | ------ | ---------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDA-WF01-ONE-APPROVAL-DELIVERY` | Gate `8ccebfa2b9c622f217c971cb9995506edb91091eab93aeccbbb71b0f68dc1015`; envelope `46eee3be937bb82f3bc0055f1a7bc697a08484498b197a1475bae33d760be8a6`; receipt `a6491e167ab12894d43e62ca279169cbcc4c0faf871ab116991a0eb7b4e37d03`; [closeout](./2026-08-21-ida-wf01-one-approval-delivery-closeout.md); PR #1622; main `43e3f7b0` | `scripted` | `S4B-rev28` | `durable-control-host` | `pass` | `not_applicable` | `not_applicable` | `pass`   | Semantic lease and protection CAS consumed; eight tuples/flags preserved; `delivery-gate@15368` added; exact-main CI/security green; CD provider lanes runnerless and stepless; S4B worktree/branch removed. |

## Next Selection

No successor is promoted. The S4B merge consumed runtime authority and cleanup advanced the
durable chain to rev28 `closeout_required`. This repository projection grants no runtime work; the
preauthorized closeout transition records rev29 `closed` only after its own exact merge/main
health and cleanup are verified. Any future slice requires fresh current authority.

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the external authority chain for program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:external`).

## Historical Authority

The complete pre-compaction queue/proof history through Rev 243 remains recoverable from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

OD17 and CI01/A1 remain unchanged, separate, and unpromoted; detailed workflow proof belongs in
the approved gate/envelope, the deterministic B0 receipt, and later stable closeout evidence.
