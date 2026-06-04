---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
tracker_id: T-105b
---

# ARCH-M1-04 Closeout And ARCH-M1-05 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-05`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-04
Authority: closeout and next-slice selection after `ARCH-M1-04`.

## Closeout Basis

`ARCH-M1-04` landed in PR `#930` with squash merge commit
`92cb4f049df56a9ffcdc22973967ba0e9c90bd2f`.

The merged slice completed `T-104b` by adding the
`domain_event_deliveries` table, migration, schema export, and tenant-isolated
RLS for per-consumer delivery records. Delivery rows are unique per
`(event_id, consumer_name)`, carry stable idempotency keys, and use a composite
tenant/event foreign key back to `domain_events`.

The relay foundation now selects events for one tenant and consumer at a time.
Undelivered mode filters through `domain_event_deliveries` and uses
transaction-safe row locking; replay mode supports arbitrary offsets and
intentionally avoids row locking. Delivery recording is idempotent, relay result
counters are explicit, and blank caller-provided delivery IDs or replay cursor
event IDs are rejected before insert or query construction.

This closes `T-104b`. `T-105` remains WIP only for the already-landed
`claim.status_changed@1` event subset; broader `case.*`, `recovery.*`, and
`membership.*` event families remain unpromoted.

No external consumers, audit projection, timeline UI, PII reference tables,
retention, crypto-shredding, GDPR erasure rendering, ida-host work, proxy,
routes, auth, tenancy, billing, README, AGENTS, broad architecture docs, or
product-surface work was started.

## Promoted Slice

Promote `ARCH-M1-05 -- Claim Status Audit Projection Consumer Foundation`.

Tracker task: `T-105b`.

## Scope

- Add the first event-derived audit projection consumer using the relay
  foundation from `T-104b`.
- Consume only the existing `claim.status_changed@1` event family.
- Project a tenant-scoped `audit_log` record from each delivered
  `claim.status_changed@1` event with deterministic, non-PII metadata.
- Make projection delivery idempotent through `domain_event_deliveries` and the
  fixed consumer name `audit_projection`.
- Prove that a projection failure after the source transaction leaves the
  outbox event replayable and does not silently lose audit intent.
- Keep existing aggregate transaction semantics: if the domain event append
  fails, the status update still rolls back.
- Inventory and narrow only the claim-status aggregate paths needed to stop
  duplicating best-effort `claim.status_changed` audit writes for this event
  family.

## Out Of Scope

- Do not emit new `case.*`, `recovery.*`, or `membership.*` event families.
- Do not build timeline reads, member timeline UI, broad audit-log migration,
  external sinks, notification consumers, billing consumers, retention,
  crypto-shredding, PII reference-key stores, or GDPR erasure rendering.
- Do not start `T-104d/f/g/h`, full `T-105`, `T-106`, `T-108`, `T-109`,
  `T-114`, `T-101`, `T-103`, `T-204`, `T-206`, or later host/product-model
  work.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy, change billing/Paddle/Stripe behavior, or
  touch README, AGENTS, broad architecture docs, or product UI.

## Why This Slice Next

`T-105b` is now the smallest valuable next M1 slice because `T-104`, `T-104c`,
and `T-104b` together provide the transactional outbox, payload classification,
and replayable per-consumer delivery foundation. The repo still has
best-effort `claim.status_changed` audit writes on claim-status paths, so the
next dependency-ordered step is to make one current event family prove the
event-derived audit model.

`T-206` timeline reads remain valuable, but they depend on broader `T-105`
event coverage and should not become a UI/read-model slice before the first
audit projection consumer proves delivery semantics. `T-204` success-fee event
bridging depends on M2 `T-201`, so it is not the next M1 slice. Additional relay
retry/claiming hardening is deferred until a real consumer exposes a concrete
failure mode beyond the completed relay foundation.

## Verification Bar

- Focused tests for projecting `claim.status_changed@1` into tenant-scoped
  `audit_log` rows.
- Idempotent replay proof through the `audit_projection` delivery consumer.
- Failure proof that projection sink errors leave the outbox event replayable
  and retryable after commit.
- Existing status/history/event rollback proof remains green.
- Existing relay/delivery selection, idempotency, and replay tests remain green.
- `git diff --check`, focused unit tests, `pnpm security:guard`,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling is available.
- Repo-scoped MCP `scope_audit` must show no proxy, route, auth, tenancy,
  billing, README, AGENTS, broad architecture docs, or product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  slice changes audit projection and delivery semantics.
