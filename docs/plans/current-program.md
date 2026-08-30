---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-08-30
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

`T-118-CRYSTAL-PRIMITIVES` completed through Tier-0 promotion PR `#1637` and product PR `#1638`.
The approved product head `449832314edad1706fc31d9688c13c5cdc302fe2`, tree
`26f300fedc342b477c1bd1ad79a17611f950d26c`, and squash merge
`79defe7af8d22dc26d78f4845a321f8906720794` matched the exact ten-path writer map and bounded
`t118-crystal-primitives` allocation. The primitives remain presentational and unmounted from
routes. Nine required checks, full PR E2E, pilot, zero-issue Sonar, focused tests, Storybook, and
responsive/accessibility browser proof were green. PR `#1636` remains the consumed capacity proof;
it added no generic reserve.

`T-117A-UNIFIED-PORTAL-SHELL` completed through Tier-0 promotion PR `#1641` and product PR
`#1642`, binding the exact
[gate](./2026-08-27-t117a-unified-portal-shell-design-gate.md),
[admission](./2026-08-27-t117a-unified-portal-shell-admission.json), and
`t117-unified-portal-shell` allocation. The approved product head
`86b9609d388b6dcab597cf7f6a6ebddd2fa00be7`, tree
`5bd0aa814a48aa722e1760f9c2f0cc4602a28ae7`, and squash merge
`a99d30903e1a6a36fad811992349384db05331a8` matched the five-path contract; the existing
`packages/ui/src/index.ts` crystal barrel export was correctly a no-op. The responsive
`Case → Actions → Timeline` shell remains pure, presentational, accessible, and unmounted from
routes. Nine required checks, full PR E2E, pilot, Sonar, focused tests, Storybook, adversarial
review, and responsive/accessibility browser proof were green. PR `#1640` remains the bounded
capacity proof and added no generic reserve.

`T-116-CASE-SUMMARY` completed through Tier-0 promotion PR `#1646` and product PR `#1647`,
binding the exact [IDA-DG56 gate](./2026-08-27-t116-case-summary-design-gate.md),
[admission](./2026-08-27-t116-case-summary-admission.json), and `t116-case-summary` allocation.
The approved product head `860c240e48024f2757d633589148d945e02595b4`, tree
`ff1077ee9be1f4ce399919fcdb42882469e3038d`, and squash merge
`cde8af2c95915b0d6aa7555bb26b94249edbdfaf` matched the exact seven-path contract. The
tenant-scoped read projection, presentation-safe discriminated union, bounded document count and
next-step token, exhaustive accident registry, and pure renderer remain unmounted from routes.
Required checks, full PR E2E, pilot, zero-issue Sonar, focused/full tests, adversarial review, and
same-head feedback intake were green. Capacity PR `#1644` and compatibility PR `#1645` remain the
bounded prerequisite proofs; neither added a generic reserve or generic Tier-3 runtime.

`T117B-DATA` completed through re-promotion PR `#1661` and product PR `#1658`, binding its
[gate](./2026-08-28-t117b-data-design-gate.md), unchanged ten-path
[admission](./2026-08-28-t117b-data-admission.json), and allocation. Product head
`b9e735535ae812c0824ecb7e7a874fe78e78303d`, tree
`728768ab05bc47a0f1cb25ec78ed6a6444264ffc`, and squash
`124ec51cefd022dd7103a4f958cb9ebef5427dad` matched. It supplies request-scoped identity and two
tenant-scoped projections without PORTAL or CUTOVER; exact-head proof and protected main were
green. PRs `#1653`–`#1660` remain recovery evidence. PR `#1665` projects PORTAL; runtime waits for
its exact merge. CUTOVER and T-117C remain default-denied.

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

| Priority | Candidate              | Dependencies   | Promotion constraint                         |
| -------: | ---------------------- | -------------- | -------------------------------------------- |
|        1 | `T117B-PORTAL` Tier 3  | DATA closed    | Exact promotion PR `#1665`; runtime awaits merge. |
|        2 | `T117B-CUTOVER` Tier 3 | PORTAL closed  | Exact PORTAL merge + deterministic closeout. |
|        3 | `T-117C` Tier 3        | CUTOVER closed | Atomic PPR + named-parallel-route migration. |

## Unified Portal Direction

Use one responsive capability shell, never role copies. `Case → Actions → Timeline` is core; order
is `T-118 → T-117A → T-116 → T-117B → role/task views`. Member starts with Help
Now/Cases/Documents; other roles retain their tasks. Tenant/legal context appears only when useful;
benchmarks guide rationale, not trade dress. T-117B uses async RSC, sibling Suspense,
request-scoped identity, and two projections. `cacheComponents`, PPR, named routes, `next.config`,
and global headers remain T-117C.

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
    "sliceId": "T117B-PORTAL",
    "tier": 3,
    "promotionPrNumber": 1665,
    "promotionBaseSha": "10635007175e6348017c622c81f5c1917d347662",
    "expectedProductBranch": "codex/t117b-portal",
    "gateSha256": "e287e9342aef6a2d63d1c20cc547b9d82f8587cd5956cf40a2d9bbe7800b3c6c",
    "admissionSha256": "50485c5b7ee68646c1f9454075c4245961fd38b11941bfcc7f0be8ef0a8bc82d",
    "productWriterPaths": [
      "apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx",
      "apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx",
      "apps/web/src/components/dashboard/case-summary/case-kind-registry.ts",
      "apps/web/src/components/dashboard/case-summary/generic-case-summary.tsx",
      "apps/web/src/components/dashboard/member-portal-region-boundary.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx",
      "apps/web/src/components/dashboard/member-portal-runtime.tsx",
      "apps/web/src/messages/en/dashboard.json",
      "apps/web/src/messages/mk/dashboard.json",
      "apps/web/src/messages/sq/dashboard.json",
      "apps/web/src/messages/sr/dashboard.json"
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
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:T117B-PORTAL`).
