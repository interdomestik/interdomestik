---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
tracker_id: T-104b
---

# ARCH-M1-03 Closeout And ARCH-M1-04 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-04`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-04
Authority: closeout and next-slice selection after `ARCH-M1-03`.

## Closeout Basis

`ARCH-M1-03` landed in PR `#928` with squash merge commit
`cc9c87554a41c431ad933b2f3396635565f5a398`.

The merged slice completed `T-104c` for current domain-event writes by enforcing
a fail-closed payload allowlist inside `appendEvent()`. The allowlist starts
with `claim.status_changed@1`, accepts only valid claim-status `fromStatus` and
`toStatus` values, rejects unsupported event names or versions, rejects missing
or extra fields, and inserts a fresh sanitized plain payload object instead of
the caller-owned object.

Focused proof covers unsupported event names and versions, missing and extra
payload fields, invalid status values, and caller prototype or `toJSON`
serialization hooks. The database package unit script now runs the deterministic
package-wide test set so the event payload boundary remains part of the domain
unit lane.

No relay/CDC, delivery table, consumers, audit projection, timeline UI,
PII-reference tables, retention, crypto-shredding, GDPR erasure rendering,
proxy, route, auth, tenancy, billing, README, AGENTS, broad architecture docs,
or product-surface work was started.

## Promoted Slice

Promote `ARCH-M1-04 -- Domain Event Relay And Delivery Foundation`.

Tracker task: `T-104b`.

## Scope

- Add the first background relay/delivery foundation for `domain_events`.
- Introduce per-consumer delivery tracking with a
  `domain_event_deliveries(event_id, consumer_name)` uniqueness boundary.
- Select unpublished or undelivered events with transaction-safe locking such as
  `FOR UPDATE SKIP LOCKED`.
- Pass stable event idempotency keys to consumers and make redelivery
  idempotent.
- Reuse the existing `commercial_action_idempotency` pattern where applicable.
- Add focused replay proof from an arbitrary offset.

## Out Of Scope

- Do not add broad external consumers, audit-log projection, timeline UI,
  reference-key stores, retention, crypto-shredding, or GDPR erasure rendering.
- Do not start `T-104d/f/g/h`, `T-105b`, `T-108`, `T-109`, `T-114`, `T-101`,
  `T-103`, or later host/product-model work.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy, change billing/Paddle/Stripe behavior, or
  touch README, AGENTS, broad architecture docs, or product UI.

## Why This Slice Next

`T-104b` is the smallest valuable next M1 slice because `T-104` supplied the
transactional outbox table/helper and `T-104c` now bounds payload privacy before
events leave the write transaction. Relay and per-consumer delivery semantics
are the next dependency for replayable event consumption and for later
event-derived audit or timeline work.

`T-105b` audit projection remains valuable, but it should consume a replayable
delivery foundation rather than invent its own one-off delivery semantics.
`T-104d/f/g/h` privacy/retention work remains dependency-ordered after the
payload allowlist, but the current event payload family is already non-PII; the
relay foundation is the narrower next observable-workflow step.

## Verification Bar

- Focused database/domain tests for delivery-table uniqueness, relay locking or
  equivalent transaction-safe selection, idempotent redelivery, and replay from
  an arbitrary offset.
- Existing domain-event payload allowlist tests remain green.
- RLS/tenant isolation checks remain green for `domain_events` and any delivery
  table added by the implementation.
- `git diff --check`, `pnpm security:guard`, focused unit tests,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling is available.
- Repo-scoped MCP `scope_audit` must show no proxy, route, auth, tenancy,
  billing, README, AGENTS, broad architecture docs, or product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  next slice changes event delivery and replay semantics.
