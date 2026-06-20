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

# OBR-DG11: Post-T402 T-309 Tenant Cache Guard Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles plan and
tracker authority after `T-402` and promotes the next governed implementation
slice. Risk tier: Tier 0 because the touched surface is docs/tracker authority
only.

## Authority Evidence

| Source                            | Evidence                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1126`                        | `T-402` implementation merged at `e0d4a7b567a90f39c28214db51f52d9e5fd72004` from final PR head `f2b46cd9bfd795903b98117169ede49e47c96203`.    |
| PR `#1127`                        | `T-402` closeout merged at `3f900fa4a5b107e285279c4c7d245c8d482c9bc0`.                                                                        |
| `plan:status` before this gate    | Records `OBR-DG10` and `T-402` as complete and no replacement implementation slice as active.                                                 |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`.                           |
| Architecture tracker              | `T-309` is the canonical tenant-keyed cache guard row, depends on completed `T-302` and `T-302b`, and remains uncompleted.                    |
| Operational Brain advisory        | Recommends `OBR-DG11` promote `T-309` as the smallest valuable next authority step; `T-403`, UX, route/proxy/M5/billing, and OB are deferred. |

## Candidate Ranking

| Rank | Candidate                                 | Decision   | Rationale                                                                                                                                                                                                                             |
| ---- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-309` tenant-keyed cache guard          | Promote    | Directly improves tenant/privacy safety and performance correctness after `T-302`/`T-302b`; it is the recorded cache twin of `assertNoTenantLeak` and is smaller than route/proxy, M5, billing, product redesign, or AI posture work. |
| 2    | `T-403`/`T-404`/`T-403b` AI posture chain | Defer      | Important but AI production posture requires its own higher-risk contracts, evals, guardrails, and review package.                                                                                                                    |
| 3    | Product UX / `T-411` / dashboard work     | Defer      | Product and UX work remain unpromoted after the T-402 closeout and should not jump ahead of the tenant-cache isolation guard without a separate design gate.                                                                          |
| 4    | `T-307`, M5, broad M3/M4/M5, billing      | Reject now | Routing/proxy, live cutover, billing-provider expansion, and broad architecture or product redesign remain outside this authority gate.                                                                                               |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-309`.

`T-309` goal: add a tenant-keyed cache guard so any `use cache` or
`unstable_cache` usage in member, staff, agent, or admin route groups fails
unless its key set includes `access_tenant_id` and, where member-scoped,
`member_id`. Shared data caches remain allowed only for explicitly non-tenant
rule packs, airline registries, plan catalogs, and locale messages.

Likely implementation surfaces for the future worker:

- Cache-guard static analysis or test/lint coverage for member/staff/agent/admin
  route groups.
- Focused cross-tenant cache-leak proof using two tenants, the same route, and
  overlapping identifiers.
- Event-driven invalidation proof for case/member tags through outbox-driven
  `revalidateTag` behavior, without client polling.
- Documentation or guard metadata only if required by the implemented guard.

## Non-Goals

- No implementation in this design-gate PR.
- No runtime, source, test, proxy, route, auth/session, tenancy model, schema,
  migration, RLS, billing/Paddle, AI posture, Operational Brain runtime,
  product UI redesign, README, AGENTS, WS-F/G/H, OMG, DOM, CRM expansion, or
  broad architecture-doc work.
- No `T-403` AI posture chain, `T-411` product UX work, route/proxy/M5/billing
  work, product redesign, or next implementation worker.
- No renaming or bypassing canonical routes and no clarity-marker changes.

## Risk And Gate Plan For The Future T-309 Worker

Expected class: implementation.

Expected risk tier: Tier 3 because the worker touches tenant/privacy isolation,
shared cache/gate behavior, and invalidation semantics. Escalate further if the
worker reaches `apps/web/src/proxy.ts`, auth/session architecture, schema/RLS,
billing-provider behavior, or product workflow redesign.

Focused acceptance proof should show:

- Guard coverage fails tenant-scoped `use cache` or `unstable_cache` usage whose
  key omits `access_tenant_id`.
- Member-scoped caches require both `access_tenant_id` and `member_id`.
- Shared caches are allowed only for the named non-tenant data classes.
- Cross-tenant cache-leak proof stays green for two tenants with overlapping ids.
- Invalidation is event-driven through tag revalidation, not client polling.

## Reviewer And Operations Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required local
proof is docs/tracker proof plus `git diff --check`.

Operational impact: none in this PR. The future `T-309` worker must record
cache-invalidation, tenant-isolation, observability, rollback, and gate evidence
for the runtime or test surfaces it changes.

## Exit State

Authority is reconciled after `T-402`; `T-309` is the only promoted next
implementation slice; `T-403`, product UX, route/proxy/M5/billing/product
redesign, Operational Brain runtime, README, AGENTS, and broad architecture work
remain deferred unless separately reauthorized.
