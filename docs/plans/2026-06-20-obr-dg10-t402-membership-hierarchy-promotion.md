---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-20
tracker_path: docs/plans/current-tracker.md
---

> Status: Completed Tier 0 promotion record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself.

# OBR-DG10: Post-T305b Authority Reconciliation And T-402 Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles plan and
tracker authority after `T-305b` and promotes the next governed implementation
slice. Risk tier: Tier 0 because the touched surface is docs/tracker authority
only.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1123`                        | `T-305b` implementation merged at `c0305ed9fdb829eb16e6fd430f17199a4a344e5b`.                                                                           |
| PR `#1124`                        | `T-305b` closeout merged at `e7c8260946d7efeae8cab4f373059f55f5769342`.                                                                                 |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice`.                                                             |
| Current program/tracker           | Record `T-113` and `T-407` as complete.                                                                                                                 |
| GitHub + repo evidence            | `T-113` merged in PR `#1025` at `d78ebea04966bea36583ccec3d7c2082c3d484f0`; `T-407` merged in PR `#1022` at `8f3b52e00319a273b4e04cf1edc1cc178e9630df`. |
| Architecture tracker drift        | `T-113` and `T-407` were still TODO before this reconciliation and are corrected to DONE in this gate.                                                  |

## Candidate Ranking

| Rank | Candidate                                          | Decision   | Rationale                                                                                                                                                                                                                                                           |
| ---- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-402` membership offer/proof/workspace hierarchy | Promote    | Depends only on completed `T-401`; directly closes an M4 product-model safety gap by making price-bearing offers unrepresentable on proof/workspace surfaces. It is smaller than cache or routing work and avoids proxy/auth/schema/RLS/billing-provider expansion. |
| 2    | `T-309` tenant-keyed cache guard                   | Defer      | Valuable isolation/performance hardening, but it touches shared cache/gate behavior and should follow the smaller product-model type boundary unless new cache-leak evidence appears.                                                                               |
| 3    | `T-403`/`T-404`/`T-403b` AI posture chain          | Defer      | Important but AI production posture is explicitly forbidden for this gate and requires its own higher-risk design/review package.                                                                                                                                   |
| 4    | `T-307`, M5, broad M3/M4/M5                        | Reject now | Routing/proxy, live-cutover, broad architecture, and structural work remain unpromoted unless separately reauthorized.                                                                                                                                              |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-402`.

`T-402` goal: type the membership hierarchy so `membership_offer` owns
price/interval/tier, while `membership_proof` and `membership_workspace` cannot
carry price-bearing offer data. Acceptance must include a type-level guarantee
and focused proof that no code path attaches price to proof/workspace.

Likely implementation surfaces for the future worker:

- Membership/product-model type definitions and helpers.
- Focused tests or compile-fail fixtures proving offer/proof/workspace separation.
- Existing membership card/workspace consumers only as needed to preserve behavior.

## Non-Goals

- No implementation in this design-gate PR.
- No runtime, product UI redesign, proxy, route, auth/session, tenancy, schema,
  migration, RLS, billing/Paddle, AI posture, Operational Brain runtime, README,
  AGENTS, WS-F/G/H, OMG, DOM, CRM expansion, or broad architecture-doc work.
- No `T-309` cache guard implementation; it remains the alternate/deferred
  candidate unless later evidence changes the ranking.
- No renaming or bypassing canonical routes and no clarity-marker changes.

## Risk And Gate Plan For The Future T-402 Worker

Expected class: implementation.

Expected risk tier: Tier 1 or Tier 2 depending on whether the worker only
changes type/domain boundaries or also touches product-facing membership
rendering. Escalate if any auth, tenancy, routing, schema/RLS, billing-provider,
or shared gate surface appears.

Focused acceptance proof should show:

- Offer data is represented separately from proof/workspace data.
- Proof/workspace types cannot include price/interval/tier.
- Existing membership-card and workspace behavior still renders from the allowed
  data shape.
- No Paddle provider expansion or invoice/tax behavior changes.

## Reviewer And Operations Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate per
`reviewer-routing.md`; no implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required local
proof is docs/tracker proof plus `git diff --check`.

Operational impact: none in this PR. The future `T-402` worker must record any
runtime, test, or product behavior evidence it actually changes.

## Exit State

Authority is reconciled after `T-305b`; `T-113` and `T-407` canonical tracker
rows match merged evidence; `T-402` is the only promoted next implementation
slice; `T-309` is explicitly alternate/deferred.
