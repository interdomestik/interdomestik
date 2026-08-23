---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-23
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document alone defines the current repository execution phase, committed
> priority, and sequence. Detailed contracts remain in the linked content-addressed artifacts.

## Current Phase

`IDA-WF01-ONE-APPROVAL-DELIVERY` is the only active writer program. B0, B1, S1A, S1B, and S2 are
terminal and consumed. Revision 20 activates only `S3-exact-authority` on protected
`main@0ea6f19f50f67a02f0ee00ace2aee51b86d0006e`, operation SHA-256
`06ca0e82cf252cf1d49382f6cde847b00d0aa40f6fb50b8f377f11ace15e1add`. The repository
projection is [current-authority-v1.json](./current-authority-v1.json); durable authority plus live
Git/GitHub identity remains the runtime source and fails closed on any mismatch.

S3 binds the approved envelope, receipt, writer map, source base `B`, PR head `H`, tested merge
`T`, returned protected main `M`, and every terminal CI lane to exact SHA/tree/run identity. Merge,
close, or terminal failure consumes the semantic lease immediately even if ledger persistence
lags. Only a green exact-main health and clean task-owned closeout may derive S4A; S4A, S4B, and
every unrelated program remain blocked until then.

The fixed sequence is B0 authority bootstrap, B1 CD guard, S1A skill authority, S1B routing
standard, S2 MCP identity, S3 exact authority, S4A terminal delivery, S4B reviewer policy, then
closeout. Each predecessor must be consumed, healthy, and clean before the next lease is derived.
No second approval is required unless a declared stop condition reveals a genuine new scope,
security, trust-boundary, or product defect.

Historical T-115 OD17 remains terminal and unchanged. CI01/A1 and PR #1610 remain separate,
unpromoted, and untouched. Workflow Protocol v1 does not authorize product, auth, routing, tenancy,
schema, RLS, billing, provider deployment, E2E-semantic, AI OS, Docker, or unit-selector work.

## M0-M5 Implementation Blueprint

| Phase | Preserved frontier                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0-M5 | The architecture-finalization program and tracker remain the canonical historical/dependency blueprint; no M0-M5 product node is promoted by this workflow-only program. |

## Ordered Candidate Priorities

| Priority | Candidate                        | Dependencies             | Promotion constraint                                                                             |
| -------: | -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
|        1 | `IDA-WF01-ONE-APPROVAL-DELIVERY` | Exact S3 authority lease | Consume S3 only after exact B/H/T/M, terminal lanes, merge/main health, and cleanup prove green. |

## Selection Constraints

- One clean repository worktree and one semantic writer; reviewers remain read-only.
- Every repository child uses focused RED→GREEN, exact writer-map proof, required Tier-3 gates,
  same-head feedback intake, expected-head merge, exact-main health, and task-owned cleanup.
- Missing, stale, mismatched, unknown, skipped, neutral, failed, or unclassifiable authority/proof
  fails closed with `runtime_authorized:false`, `activeSlice:null`, and successors blocked.
- Production executable code prefers `<=150` physical lines; 151–300 is advisory with unchanged
  complexity, duplication, security, tests, and coverage, while `>300` requires split or exposed
  cohesion/risk rationale. Focused tests are `<=300`; structured/governance/workflow/generated
  surfaces follow their typed contracts. No minification.
- Models, Z620, cache data, and advisory memory can support evidence but cannot grant authority.
- Existing unrelated worktrees, branches, PRs, artifacts, histories, and provider state are preserved.

## Historical Authority

Authority history through Rev 243 remains recoverable byte-for-byte from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The architecture-finalization program/tracker, terminal OD17 evidence, and CI01 artifacts remain
historical or separately governed. This projection neither rewrites nor activates them.

<!-- prettier-ignore -->
The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:true`).
