---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
tracker_id: T-105b
---

# ARCH-M1-05 Closeout And ARCH-M1-06 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-06`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-04
Authority: closeout and next-slice selection after `ARCH-M1-05`.

## Closeout Basis

`ARCH-M1-05` landed in PR `#932` with squash merge commit
`2cf984c6b66eae1a05e5ff8e3c5a4072ff07ee05`.

The merged slice added the first bounded audit projection consumer foundation
for `claim.status_changed@1`. The consumer uses the fixed name
`audit_projection`, projects deterministic tenant-scoped audit rows with IDs
derived from the domain event, records event-created-at in metadata instead of
copying the domain-event timestamp into `audit_log.created_at`, and treats
repeat projection as idempotent.

The relay can now narrow selection by event name and version. The
`claim.status_changed@1` projection wrapper applies those filters, validates
blank event names before query construction, and leaves unsupported event
families outside the projection. Focused tests prove projection row shape,
idempotent replay, projection-failure-before-delivery behavior, unsupported
event rejection, and relay event-name/version filtering.

This completes the `ARCH-M1-05` audit projection consumer foundation. It does
not complete all of `T-105b`: repo evidence still shows legacy best-effort
`claim.status_changed` audit writes in domain-claims status paths. Until the
projection path is activated and those duplicate writes are retired, `T-105b`
remains `WIP`.

No timeline reads, member timeline UI, billing consumers, broader event
families, PII reference stores, retention, crypto-shredding, GDPR erasure
rendering, ida-host work, proxy, routes, auth, tenancy, billing, README,
AGENTS, broad architecture docs, or product-surface work was started.

## Promoted Slice

Promote `ARCH-M1-06 -- Claim Status Audit Projection Activation And Legacy
Audit Retirement`.

Tracker task: `T-105b`.

## Scope

- Activate the existing `claim.status_changed@1` audit projection path through
  a repo-owned bounded runner or service entrypoint that uses the
  `audit_projection` consumer and relay delivery records.
- Retire duplicate best-effort `claim.status_changed` audit writes from the
  claim-status aggregate paths that already append `claim.status_changed@1`
  domain events.
- Preserve existing status/history/event transaction semantics: if domain-event
  append fails, status/history still roll back together.
- Preserve replay safety: if projection fails after commit, the event remains
  undelivered for `audit_projection` and can be retried without silent audit
  loss.
- Prove that projected audit rows, not legacy best-effort calls, now cover the
  current claim status-change event family.
- Keep any activation mechanism tenant-scoped and narrowly limited to the
  existing `claim.status_changed@1` event family.

## Out Of Scope

- Do not emit new `case.*`, `recovery.*`, or `membership.*` event families.
- Do not build member timeline reads, timeline UI, notification consumers,
  billing consumers, external sinks, broad audit-log migration, retention,
  crypto-shredding, PII reference-key stores, or GDPR erasure rendering.
- Do not start `T-104d/f/g/h`, full `T-105`, `T-106`, `T-108`, `T-109`,
  `T-114`, `T-101`, `T-103`, `T-204`, `T-206`, or later host/product-model
  work.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy, change billing/Paddle/Stripe behavior, or
  touch README, AGENTS, broad architecture docs, or product UI.

## Why This Slice Next

`T-105b` is not done after `ARCH-M1-05` because the projection consumer exists
but the legacy claim-status best-effort audit calls still remain. Jumping to
`T-206` timeline reads would be premature because timeline evidence should not
depend on a partially activated audit projection path. Jumping to `T-104f`
reference-only PII tables would also leave the current duplicate audit source
unresolved.

`ARCH-M1-06` is therefore the smallest dependency-ordered slice: it finishes the
claim-status subset of event-derived audit by turning the projection foundation
into the active audit source for the already-emitted event family, while keeping
broader event families, timeline reads, PII stores, and billing consumers out of
scope.

`T-106` remains independently valuable, but it is not the next event/audit
dependency and does not unlock the immediate `T-105b` correctness gap exposed by
repo evidence.

## Verification Bar

- Focused tests prove claim status-change audit rows come from the
  `audit_projection` path.
- Focused tests prove legacy best-effort `claim.status_changed` audit calls are
  not invoked on the aggregate status paths covered by `claim.status_changed@1`
  domain events.
- Existing status/history/event rollback proof remains green.
- Existing projection idempotency, projection-failure, relay selection, delivery
  idempotency, and replay tests remain green.
- `git diff --check`, focused unit tests, `pnpm security:guard`,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling is available.
- Repo-scoped MCP `scope_audit` must show no proxy, route, auth, tenancy,
  billing, README, AGENTS, broad architecture docs, or product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  slice changes audit projection activation and aggregate audit semantics.
