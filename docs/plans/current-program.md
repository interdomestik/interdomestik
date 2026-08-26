---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-26
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This document alone defines the current repository execution phase, committed
> priority, and sequence. Detailed contracts remain in the linked content-addressed artifacts.

## Current Phase

`IDA-LA01-LEAN-AUTHORITY-BOOTSTRAP` completed in PR `#1629`: approved head
`2845d36523f9f4f186f595336d9b3cd0d5158b00`, tree `3657eac816f4ce16678b68f74fff2f5a1a389593`,
and squash `9f35b2eaf4904f8c0a02542632b51a92f8df4d3e` matched. Nine checks, 12/12 threads,
zero-issue Sonar, and main were green; CD `32860119345` stopped pre-build with zero effects.

`IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` completed in PR `#1634`: approved head
`6d7430b53dae921c2835e2729a322aece326812b`, tree
`fe087d45535aca6797ecd83172d90ba8a730442d`, and squash merge
`92abb4ba4f7db614840357ebb5ad4dc99b9ee21e` matched the frozen base/tree. The public entry door is
now Header, HomePageRuntime (canonical Hero V2, Free Start, and preserved session/analytics),
PricingSection, then Footer. Eight legacy sections are reversibly unmounted; their files and E2E
contracts remain unchanged. Nine required checks, the broad E2E gate, pilot gate, Sonar, focused
unit/browser evidence, and exact-main identity were green.

Candidate `#1637` projects `T-118-CRYSTAL-PRIMITIVES` after Tier-0 merge, binding the exact base,
[gate](./2026-08-26-t118-crystal-primitives-design-gate.md),
[admission](./2026-08-26-t118-crystal-primitives-admission.json), and
`codex/t118-crystal-primitives`. PR `#1636` supplied capacity; runtime waits for merge/owner/resolver.

Closed `IDA-WF01-ONE-APPROVAL-DELIVERY` remains immutable evidence through its
[closeout](./2026-08-21-ida-wf01-one-approval-delivery-closeout.md),
[authority anchor](./current-authority-v1.json), artifacts, and receipts; it grants no Lean runtime.

T-115 OD17 is terminal. CI01/A1 and PR #1610 remain separate/unpromoted. Workflow Protocol v1
grants no product, auth, routing, tenancy, schema/RLS, billing, provider, E2E, AI, or Docker work.

## M0-M5 Implementation Blueprint

| Phase | Preserved frontier                                                                         |
| ----- | ------------------------------------------------------------------------------------------ |
| M0-M5 | Architecture-finalization program/tracker remain the blueprint; no M0-M5 node is promoted. |

## Ordered Candidate Priorities

| Priority | Candidate      | Dependencies             | Promotion constraint                                   |
| -------: | -------------- | ------------------------ | ------------------------------------------------------ |
|        1 | `T-118` Tier 2 | Tier-0 candidate `#1637` | Only the exact ten-path primitive branch may activate. |
|        2 | `T-117` Tier 2 | T-118                    | Deferred; no branch or shared-shell edit.              |

## Unified Portal Direction

Preserve one responsive, capability-driven shell across roles, never five copied dashboards.
`Case → Actions → Timeline` is the core; order is `T-118 primitives → T-117 shell → role/task
views`. Member starts with Help Now/Cases/Documents; agent with clients/follow-ups; staff with
queue/SLA/triage; manager with team/performance; admin with organization/audit. Tenant/legal
context appears only when relevant. Benchmarks are rationale, not trade dress; reuse the existing
system and M1–M5 architecture. This Tier-2 direction grants no runtime authority.

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

<!-- prettier-ignore -->
```json lean-authority
{
  "schemaVersion": 1,
  "authority": "lean-tier12-v1",
  "lifecycle": "promotion_pending",
  "owner": {
    "login": "arbenl",
    "id": 62884977
  },
  "activeSlice": {
    "sliceId": "T-118-CRYSTAL-PRIMITIVES",
    "tier": 2,
    "promotionPrNumber": 1637,
    "promotionBaseSha": "6ff846deb9d99ad103d81dba5e4de46343dcf965",
    "expectedProductBranch": "codex/t118-crystal-primitives",
    "gateSha256": "12ce2d377dafe635d5d5b7be05de6c739c3563d841bb6f646804f599d7c49e74",
    "admissionSha256": "ca3a543f553b71fc36023d80af4e242db40638ccf51a64777678b0352386e093",
    "productWriterPaths": [
      "packages/ui/src/components/crystal/tokens.ts",
      "packages/ui/src/components/crystal/matte-anchor-card.tsx",
      "packages/ui/src/components/crystal/refractive-glass-panel.tsx",
      "packages/ui/src/components/crystal/stepper.tsx",
      "packages/ui/src/components/crystal/timeline.tsx",
      "packages/ui/src/components/crystal/index.ts",
      "packages/ui/src/components/crystal/crystal.stories.tsx",
      "packages/ui/src/index.ts",
      "apps/web/src/components/dashboard/crystal-primitives.test.tsx",
      "apps/web/src/components/dashboard/crystal-boundary.test.ts"
    ],
    "closeoutWriterPaths": [
      "docs/plans/current-program.md",
      "docs/plans/current-tracker.md"
    ]
  }
}
```

## Historical Authority

Authority history through Rev 243 remains recoverable byte-for-byte from
[the archive manifest](./history/current-authority/2026-08-16-through-rev-243.manifest.json).
Manifest SHA-256: `355229c5d24a6fa5f0986b6ce41423cbdc5caea16b291f1335a7264b2be5fc78`.

The architecture-finalization program/tracker, terminal OD17 evidence, and CI01 artifacts remain
historical or separately governed. This projection neither rewrites nor activates them.

<!-- prettier-ignore -->
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T-118-CRYSTAL-PRIMITIVES`).
