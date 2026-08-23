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

`IDA-WF01-ONE-APPROVAL-DELIVERY` is the only active writer program. B0, B1, S1A, and S1B are
terminal and consumed. S2 incident recovery is bound to protected
`main@2512bca54b200f6cdd07051a9ae3e9513ae6a1aa` by gate
`IDA-WF-DG01-S2-TRANSPORT-INCIDENT-RECOVERY-R2` at SHA-256
`d55c180e64659e12f22400e1e20adc08dfa1ea2821a997b6798370ea26f3b464`, admission
`abd52f22a5b266144406714048b90ef615e7c17acb76c42a451f4ebeabd41d7b`, and receipt
`e3353f95e703d49d8d74e238acd551ebc4f11795a7b67c50699fa9387f04329b`.

Revision 18 recovered only `S2-mcp-identity`. The registered runtime now equals exact protected
main, fresh MCP discovery is healthy, and the complete A-to-B-to-A/concurrent/negative-root proof
is terminal at SHA-256 `de3ef039658c40a064829b6adf607076532b16e4e7a6bef9d640636d3b0e21ff`.
This projection must merge with exact-head checks, protected-main health, and clean task-owned
cleanup before append-only revisions 19 and 20 may consume S2 and activate only
`S3-exact-authority`. Until those conditions hold, S3 and every later child remain blocked.

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

| Priority | Candidate                        | Dependencies                     | Promotion constraint                                                                          |
| -------: | -------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
|        1 | `IDA-WF01-ONE-APPROVAL-DELIVERY` | Exact S2 recovery and live proof | Consume S2 only after this projection merges healthy, then activate S3 as the sole successor. |

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
