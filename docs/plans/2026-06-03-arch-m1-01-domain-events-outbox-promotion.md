---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-03
tracker_id: T-104
---

# ARCH-M1-01 Domain Events Outbox Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-01`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-03
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-18`.

## Closeout Basis

`ARCH-M0-18` landed in PR `#920` with squash merge commit
`c225e06e73b4819268c7b66250266594f1dee5d6`, classifying claim
creation and submit paths as initialization-only writers in the
claim-status writer guard.

The merged slice preserved claim creation and submission behavior, existing
public/package API shapes, tenant/member scoping, initial status values,
claim-pack creation, evidence handling, and existing runtime tests. It added
guard proof that `packages/domain-claims/src/claims/create.ts` and
`packages/domain-claims/src/claims/submit.ts` remain insert-only
initialization paths, while unexpected post-create status writers still fail.

The guard now reports 14 classified writers: transition command/runtime wrapper
paths, creation/submit initialization paths, and fixture/seed/pilot paths.
Phase C routing and architecture boundaries remained intact:
`apps/web/src/proxy.ts` stayed read-only, canonical routes stayed `/member`,
`/agent`, `/staff`, and `/admin`, and no auth/session/tenancy/schema/billing
work was started.

## Promoted Slice

Promote `ARCH-M1-01 -- Domain Events Transactional Outbox Foundation`.

Tracker task: `T-104`.

Goal: add the additive `domain_events` transactional outbox table and the
smallest typed `appendEvent(tx, ...)` helper needed before claim transitions
can append events atomically in later `T-105` / `T-002c` work.

## Current Evidence

- The direct post-create claim-status writer adoption work is complete under
  the writer guard, but `T-002` remains WIP because the transition command does
  not yet append a domain event.
- `T-002c` atomic rollback proof depends on an event append surface existing
  first; starting `T-002c` before `T-104` would overfit tests around missing
  infrastructure.
- The architecture tracker lists `T-104` as the transactional outbox foundation
  that provides the event table and `appendEvent(tx, ...)` helper.

## Scope

- Inspect current database schema, Drizzle migration conventions, transaction
  helper patterns, existing webhook/outbox-adjacent tables, and event references
  in the architecture tracker before changing code.
- Add only the additive `domain_events` schema/migration and narrow helper
  needed for in-transaction appends.
- Keep payload typing conservative and PII-safe enough for the foundation;
  broader PII allowlist/redaction, delivery, retention, and audit projection
  work remains in later `T-104b/c/d/f/g/h` and `T-105b`.
- Add focused unit/schema proof that the helper writes inside a caller-owned
  transaction and records tenant, actor, entity, event name/version,
  correlation id, aggregate version, payload, and creation time as defined by
  the tracker.

## Out Of Scope

- Do not wire claim status transitions to emit domain events in this slice;
  reserve that for `T-105` / `T-002c` after the outbox foundation exists.
- Do not add a relay, CDC worker, delivery table, replay tooling, event
  consumers, audit-log projection, retention/crypto-shredding, or timeline UI.
- Do not start `T-002b`, `T-105b`, `T-108`, `T-109`, `T-114`, later M1 host
  work, product-surface redesign, proxy, routes, auth, session, tenancy model
  refactors, billing, Paddle/Stripe, README, AGENTS, or broad architecture-doc
  work.

## Verification Bar

- Focused proof: database/schema/helper tests for `domain_events` and
  `appendEvent(tx, ...)`.
- Migration proof: run the repo migration/schema checks appropriate for an
  additive Drizzle table.
- Required local gates appropriate for a schema/observability Tier 3 slice,
  including `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate`
  before merge readiness under Phase C rules.
- Scope proof: repo-scoped MCP `scope_audit` must confirm the implementation
  stays out of `apps/web/src/proxy.ts`, route/auth/session/tenancy model
  refactors, billing/Paddle, README, AGENTS, and unrelated product surfaces.
- Model review: Sonnet 4.6 architecture/scope review is required before PR
  readiness because this is schema plus event/outbox architecture work. Gemini
  is not applicable unless implementation changes product-facing UX/copy.
