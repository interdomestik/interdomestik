---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
tracker_id: T-104c
---

# ARCH-M1-02 Closeout And ARCH-M1-03 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-03`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-04
Authority: closeout and next-slice selection after `ARCH-M1-02`.

## Closeout Basis

`ARCH-M1-02` landed in PR `#926` with squash merge commit
`ddbc207ca51b36a09ba1c2358f831c7e24504beb`.

The merged slice completed the remaining `T-002` event-append obligation and
`T-002c` atomic-command guarantee by wiring `transitionClaimStatus()` to append
one conservative non-PII `claim.status_changed` domain event inside the same
transaction as the claim status update, `lifecycle_version` update, and
`claimStageHistory` insert.

Focused proof shows successful status-changing transitions commit status,
history, and event together, while fault-injection paths roll all three back
together. Same-status no-op/history paths intentionally do not emit
`claim.status_changed`. PR `#926` also enabled tenant-isolated RLS on
`domain_events`.

This closes `T-002` for current claim-status writers and closes `T-002c`.
`T-105` is now started only for the claim status-change event subset; broader
`case.*`, `recovery.*`, `membership.*`, audit projection, relay, delivery,
timeline, and PII-reference work remains later.

## Promoted Slice

Promote `ARCH-M1-03 -- Domain Event Payload PII Allowlist And Redaction`.

Tracker task: `T-104c`.

## Scope

- Define the narrow payload classification/allowlist boundary for current
  `domain_events` writes, starting with `claim.status_changed`.
- Add a guard that rejects unallowlisted payload fields before insertion,
  enforced inside `appendEvent()` or an unconditional validator it calls.
- Keep allowed claim-transition payload fields conservative and non-PII.
- Cover the guard with seeded allow/reject tests.
- Preserve existing `appendEvent(tx, ...)` transaction semantics and RLS posture.

## Out Of Scope

- Do not add relay/CDC, `domain_event_deliveries`, replay tooling, consumers,
  audit-log projection, timeline UI, reference-key stores, retention,
  crypto-shredding, or GDPR erasure rendering.
- Do not start `T-104b/d/f/g/h`, `T-105b`, `T-108`, `T-109`, `T-114`,
  `T-101`, `T-103`, or later host/product-model work.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy, change billing/Paddle/Stripe behavior, or
  touch README, AGENTS, broad architecture docs, or product UI.

## Why This Slice Next

`T-104c` is the smallest valuable next M1 slice because the event table now has
real claim-transition writes. Enforcing payload classification before relay or
additional event families prevents broad distribution of under-classified data.
`T-104b` relay/delivery remains valuable, but it widens delivery semantics and
should follow the payload allowlist. `T-105b` audit projection now has the
`T-002c` dependency unblocked, but it should follow payload classification so
audit-derived event consumption does not inherit arbitrary metadata risk.

## Verification Bar

- Focused domain/database tests for allowed and rejected event payloads.
- Existing claim transition event and rollback tests remain green.
- RLS/tenant isolation checks remain green for `domain_events`.
- `git diff --check`, `pnpm security:guard`, focused unit tests,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling is available.
- Repo-scoped MCP `scope_audit` must show no proxy, route, auth, tenancy,
  billing, README, AGENTS, broad architecture docs, or product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  slice sets the privacy boundary for event payloads.
