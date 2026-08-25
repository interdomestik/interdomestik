---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-25
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document alone defines the current repository execution phase, committed
> priority, and sequence. Detailed contracts remain in the linked content-addressed artifacts.

## Current Phase

`IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP` is the one-time Tier-3 installation of the repo-native Lean
authority validator. The installed projection below is intentionally inactive: it grants no
product runtime, names no successor, and requires a later Tier-0 promotion PR before any Tier-1/2
product branch can start.

Exact delivery binds source base `B`, PR head `H`, tested merge `T`, returned protected main `M`,
required terminal lanes, final feedback intake, and the approved writer map. Merge, close, or a
terminal failure consumes the semantic lease immediately even if durable persistence lags. A
successor can be derived only after exact-main health and task-owned cleanup are green.

`IDA-WF01-ONE-APPROVAL-DELIVERY` remains closed, immutable historical evidence. Its stable
[closeout](./2026-08-21-ida-wf01-one-approval-delivery-closeout.md),
[current-authority anchor](./current-authority-v1.json), content-addressed artifacts, and durable
receipt chain remain historical verification inputs only and cannot grant Lean runtime.

Historical T-115 OD17 remains terminal and unchanged. CI01/A1 and PR #1610 remain separate,
unpromoted, and untouched. Workflow Protocol v1 does not authorize product, auth, routing, tenancy,
schema, RLS, billing, provider deployment, E2E-semantic, AI OS, Docker, or unit-selector work.

## M0-M5 Implementation Blueprint

| Phase | Preserved frontier                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0-M5 | The architecture-finalization program and tracker remain the canonical historical/dependency blueprint; no M0-M5 product node is promoted by this workflow-only program. |

## Ordered Candidate Priorities

| Priority | Candidate                | Dependencies            | Promotion constraint                                                                |
| -------: | ------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
|        1 | No active governed slice | Lean validator inactive | A Tier-0 promotion PR must bind exactly one Tier-1/2 slice and continuation branch. |

## Unified Portal Direction

The later UI design gate must preserve one responsive shell across member, agent, staff, branch
manager, and admin, with navigation driven by role capabilities rather than five copied
dashboards. `Case → Actions → Timeline` is the shared operational core. Delivery order is
`T-118 design system → T-117 shared shell → role/task views`: member starts with Help Now, Cases,
and Documents; agent with clients and follow-ups; staff with queue, SLA, and triage; manager with
team and performance; admin with organization and audit. Tenant or legal context appears only when
operationally relevant.

Current benchmarks and trend evidence are rationale sources, not UI to copy. The gate must reuse
Interdomestik's existing design system and M1–M5 architecture; it does not authorize a total visual
rebuild. This section is a future Tier-2 design constraint only and grants no runtime authority.

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
- The repository validator is the sole runtime authority. External skills and MCP state are
  read-only conveniences and cannot grant or block a Lean slice.
- Existing unrelated worktrees, branches, PRs, artifacts, histories, and provider state are preserved.

## Lean Authority

```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "inactive",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": null
}
```

## Historical Authority

Authority history through Rev 243 remains recoverable byte-for-byte from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The architecture-finalization program/tracker, terminal OD17 evidence, and CI01 artifacts remain
historical or separately governed. This projection neither rewrites nor activates them.

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:null`).
