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

`IDA-WF01-ONE-APPROVAL-DELIVERY` is the only current writer program. The repository stores only a
stable anchor in [current-authority-v1.json](./current-authority-v1.json). The active child, base,
operation, and writer map are derived at runtime from that anchor, the content-addressed envelope
and approval receipt, the complete durable authority-receipt chain, and live Git/GitHub/MCP
identity. Missing, stale, skipped, or contradictory evidence fails closed; this prose never grants
runtime authority.

Exact delivery binds source base `B`, PR head `H`, tested merge `T`, returned protected main `M`,
required terminal lanes, final feedback intake, and the approved writer map. Merge, close, or a
terminal failure consumes the semantic lease immediately even if durable persistence lags. A
successor can be derived only after exact-main health and task-owned cleanup are green.

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

| Priority | Candidate                        | Dependencies             | Promotion constraint                                                                    |
| -------: | -------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
|        1 | `IDA-WF01-ONE-APPROVAL-DELIVERY` | External authority chain | Resolve exactly one child from canonical artifacts, durable history, and live identity. |

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
The next active governed implementation goal is resolved only by the external authority chain for program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:external`).
