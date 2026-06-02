---
status: accepted
date: 2026-06-02
owner: platform + architecture + qa
tracker: T-010
---

# ADR-04: Claim Status Transition Sole Writer

## Status

Accepted.

## Context

Architecture Finalization M0 is reducing claim-status drift before later case,
recovery, event, and tenant-context work expands the state model. Before M0, the
repository had several paths that could write `claims.status` directly. That made
transition rules, audit/history persistence, optimistic concurrency, and tenant
scope harder to reason about across PRs.

The landed M0 evidence is:

- `T-000` inventoried claim-status writers and added drift guard coverage in PR
  `#880`.
- `T-001` and `T-001b` added `canTransition(...)`,
  `transitionClaimStatus(...)`, `claims.lifecycleVersion`, lifecycle compare and
  set behavior, and stage-history persistence in PR `#881`.
- `T-003` routed the staff claim-status writer through
  `transitionClaimStatusInTransaction(...)` in PR `#883`, completing the first
  bounded `T-002` adoption step.
- `T-004` and `T-005` added reusable tenant-leak proof for applicable list-query
  surfaces in PRs `#885` and `#887`.
- `T-006`, `T-006b`, `T-007`, `T-007b`, and `T-008` added role, copy, and
  modularity guardrails in PRs `#889`, `#892`, `#894`, `#896`, and `#897`.
- `T-009` converted the claim-status domain writer to the package
  `ActionResult` contract in PR `#899`.

## Decision

`canTransition(...)` is the single rule authority for claim-status state
eligibility, and `transitionClaimStatus(...)` /
`transitionClaimStatusInTransaction(...)` is the sole write authority for
persisted claim-status transitions.

New or modified claim-status writers must route status changes through that
transition command instead of writing `claims.status` directly. Direct writes are
allowed only for explicitly approved seeds, migrations, backfills, test fixtures,
or a later repo-canonical migration slice that documents why the transition
command cannot be used.

The transition command owns these invariants:

- tenant scope is supplied at the command boundary and enforced in the write;
- current status is validated before transition evaluation;
- status eligibility is delegated to `canTransition(...)`;
- lifecycle compare and set prevents silent lost updates;
- stage history is appended inside the same transaction;
- public/private status-change intent remains explicit;
- side effects such as audit, notifications, revalidation, and commercial
  prerequisites stay outside the status persistence primitive unless a later ADR
  extends the command boundary.

## Consequences

Positive:

- Claim-status changes have one testable state-machine rule surface.
- Concurrent status updates fail deterministically through lifecycle conflict
  behavior instead of overwriting each other silently.
- Later `T-002b`, `T-002c`, case/recovery, and event/outbox work can add
  invariants around the transition command without hunting every writer first.

Negative:

- Existing legacy writers must be migrated in bounded slices instead of making
  opportunistic direct updates.
- Callers with extra prerequisites need to validate them before invoking the
  transition command or wrap the command in a transaction.

## Boundaries

This ADR records architecture only. It does not migrate additional writers,
extend `canTransition(...)` for service/flight invariants, alter schema, change
auth or tenancy, change routes, or touch `apps/web/src/proxy.ts`.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/plans/2026-06-02-arch-m0-09-closeout-and-t-010-promotion.md`
- `packages/domain-claims/src/claims/transition.ts`
- `packages/domain-claims/src/claims/transition-guard.ts`
- `packages/domain-claims/src/staff-claims/update-status.ts`
