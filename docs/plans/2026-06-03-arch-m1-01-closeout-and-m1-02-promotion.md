---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-03
tracker_id: T-002
---

# ARCH-M1-01 Closeout And ARCH-M1-02 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-02`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-03
Authority: closeout and next-slice selection after `ARCH-M1-01`.

## Closeout Basis

`ARCH-M1-01` landed in PR `#924` with squash merge commit
`b742476ed6906749e1cdc61086588eea8f11d2e5`.

The merged slice completed `T-104` by adding the additive `domain_events`
transactional outbox table, Drizzle schema export, migration SQL/snapshot
metadata, and typed `appendEvent(tx, ...)` helper. The helper writes only
through the caller-owned transaction, validates the event shape before insert,
and lets the database default own `created_at` unless a caller explicitly
supplies `createdAt`.

No claim transition event wiring, relay, delivery table, audit projection,
PII reference model, timeline UI, proxy, route, auth, tenancy, billing, or
product-surface work was started.

## Promoted Slice

Promote `ARCH-M1-02 -- Claim Transition Event Append Atomicity`.

Tracker tasks: remaining `T-002` event append portion, `T-002c`, and the first
bounded claim-transition event slice under `T-105`.

## Scope

- Wire `transitionClaimStatus()` to call `appendEvent(tx, ...)` inside the
  same transaction as status update and `claimStageHistory` insert.
- Emit one conservative, non-PII claim transition event for each successful
  claim-status transition.
- Use `lifecycle_version` / aggregate version consistently for event ordering.
- Add focused runtime tests proving successful transition writes status,
  history, and one event in the same transaction.
- Add fault-injection proof that if history or event append fails, status does
  not partially commit.
- Keep existing API/result/error behavior intact for adopted writer paths.

## Out Of Scope

- Do not add relay/CDC, `domain_event_deliveries`, replay tooling, consumers,
  audit-log projection, timeline UI, PII reference tables, retention,
  crypto-shredding, or GDPR erasure rendering.
- Do not start `T-104b/c/d/f/g/h`, `T-105b`, `T-108`, `T-109`, `T-114`,
  `T-101`, `T-103`, or later M1 host/product-model work.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy, change billing/Paddle/Stripe behavior, or
  touch README, AGENTS, broad architecture docs, or product UI.

## Verification Bar

- Focused domain transition tests for successful event append and rollback on
  event/history failure.
- Claim-status writer guard remains green.
- Migration/schema tests only as needed; no new schema is expected.
- `git diff --check`, `pnpm security:guard`, focused unit tests,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling is available.
- Repo-scoped MCP `scope_audit` must show no proxy, route, auth, tenancy,
  billing, README, AGENTS, or unrelated product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  slice changes transactional event semantics.
