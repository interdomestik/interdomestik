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
`2845d36523f9f4f186f595336d9b3cd0d5158b00`, tree
`3657eac816f4ce16678b68f74fff2f5a1a389593`, and squash merge
`9f35b2eaf4904f8c0a02542632b51a92f8df4d3e` matched the frozen base/tree. Nine required checks,
12/12 threads, Sonar (zero issues), and main health were green. CD `32860119345` stopped pre-build;
zero provider effects.

`IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` is the sole promoted Tier-2 successor through Tier-0 PR
`#1633`. It binds base `b7284c35b79d1d5ee1b09a674da4f6bbd9a0c7b2`, the exact
[gate](./2026-08-25-t118-design-system-design.md),
[admission](./2026-08-25-t118-design-system-admission.json), and branch
`codex/ida-ui07-minimal-entry-door-cutover`. The two artifact names are legacy handles for the
existing bounded `t118-promotion` allocation, now consumed solely by IDA-UI07; T-118 remains
`design_gate_next_unpromoted` with no capacity or authority. Runtime stays unauthorized until the
exact owner marker and repo resolver pass.

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

| Priority | Candidate                                    | Dependencies                                 | Promotion constraint                                                                  |
| -------: | -------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
|        1 | `IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER` Tier 2 | Tier-0 PR `#1633` exact merge and owner mark | Only the exact two-path product branch may activate; T-118 and T-117 remain deferred. |

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
    "sliceId": "IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER",
    "tier": 2,
    "promotionPrNumber": 1633,
    "promotionBaseSha": "b7284c35b79d1d5ee1b09a674da4f6bbd9a0c7b2",
    "expectedProductBranch": "codex/ida-ui07-minimal-entry-door-cutover",
    "gateSha256": "3a823c44670a6b288cd19eafe48fb5dc35029bd0df45f52a185ba64c0e27c95a",
    "admissionSha256": "b0624971e94d4a4b9fb086bfb5cdd139cbecdc7517e51aa1ffa8ccfebbfef3cd",
    "productWriterPaths": [
      "apps/web/src/app/[locale]/page.tsx",
      "apps/web/src/app/[locale]/page.test.tsx"
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
The next active governed implementation goal is resolved only by the repo-owned Lean authority validator (`runtime_authorized:false`; `activeSlice:IDA-UI07-MINIMAL-ENTRY-DOOR-CUTOVER`).
