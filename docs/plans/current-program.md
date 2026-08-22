---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-22
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document alone defines the current repository execution phase, committed
> priority, and sequence. Detailed contracts remain in the linked content-addressed artifacts.

## Current Phase

`IDA-WF01-ONE-APPROVAL-DELIVERY` is the only active writer program. Gate
`IDA-WF-DG01-ONE-APPROVAL-DELIVERY-R4-GOVERNANCE-HEADING-INHERITANCE-REPAIR` at SHA-256
`8ccebfa2b9c622f217c971cb9995506edb91091eab93aeccbbb71b0f68dc1015` and envelope
`IDA-WF01-ONE-APPROVAL-DELIVERY-ENVELOPE-V4-GOVERNANCE-HEADING-INHERITANCE-REPAIR` at SHA-256
`46eee3be937bb82f3bc0055f1a7bc697a08484498b197a1475bae33d760be8a6` were approved against
protected `main@1a13176c118de88928593af846b6a14310aac645`. B0 and B1 are terminal. After this exact
governance repair merges healthy and its replacement receipt/ledger are rebound, only
`S1A-skill-authority` is active with `runtime_authorized:true`; S1B and all later children remain
blocked until S1A is atomically installed, verified, consumed, and cleaned.

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

| Priority | Candidate                        | Dependencies                         | Promotion constraint                                                                                 |
| -------: | -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
|        1 | `IDA-WF01-ONE-APPROVAL-DELIVERY` | Exact approved R4 gate/envelope/base | Execute only S1A, then the frozen S1B→S2→S3→S4A→S4B→closeout topology, one consumed lease at a time. |

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
