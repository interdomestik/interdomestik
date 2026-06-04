---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
tracker_id: T-103
---

# ARCH-M1-06 Closeout And ARCH-M1-07 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-07`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-04
Authority: closeout and next-slice selection after `ARCH-M1-06`.

## Closeout Basis

`ARCH-M1-06` landed in PR `#934` with squash merge commit
`462e5c3baf5131ade6615bf1c935a795304bc85e`.

The merged slice completed the current `T-105b` claim-status subset by
activating the bounded `claim.status_changed@1` audit projection path from
claim status transitions and retiring duplicate best-effort
`claim.status_changed` audit writes from the aggregate status paths.

The projection path remains tenant-scoped through the fixed
`audit_projection` consumer and relay delivery records. Projected audit rows
preserve the sanitized event payload contract (`fromStatus` and `toStatus`)
while tests prove claim-stage history still retains note/public metadata.
Projection delivery remains retryable because delivery records are written
only after successful projection.

This closes `T-105b` for the active claim-status event family. Broader `T-105`
event coverage remains WIP: `case.*`, `recovery.*`, `membership.*`, billing
consumers, timeline reads, and coverage snapshot events remain unpromoted.

No timeline UI, member timeline reads, billing consumers, broader event
families, PII reference stores, retention, crypto-shredding, GDPR erasure
rendering, ida-host work, proxy, routes, auth, tenancy, billing, README,
AGENTS, broad architecture docs, or product-surface work was started.

## Promoted Slice

Promote `ARCH-M1-07 -- Claim Lifecycle State Foundation`.

Tracker task: `T-103`.

## Scope

- Add nullable `case_lifecycle_state` and `recovery_lifecycle_state` columns
  to the existing claim table with additive migration/schema changes.
- Define the current status-to-lifecycle mapping using the existing
  transition/status authority; keep `status` authoritative through M2.
- Wire `transitionClaimStatus()` so new status-changing transitions persist
  both lifecycle states alongside the existing status, lifecycle-version,
  history, and domain-event transaction.
- Keep initialization-only claim creation/submit paths classified as
  initialization and populate lifecycle states only where the existing
  aggregate rules make the mapping deterministic.
- Add parity proof that current statuses map to expected case/recovery
  lifecycle states and that new/updated rows carry both fields.

## Out Of Scope

- Do not make lifecycle states authoritative for readers; that is `T-202`.
- Do not split `domain-claims` into `domain-case` / `domain-recovery`; that is
  `T-201`.
- Do not add incident-country fields/backfills (`T-101` / `T-102`), legal
  entity fields, `ida.*` host work, or tenant-context refactors.
- Do not emit new `case.*`, `recovery.*`, or `membership.*` event families.
- Do not build member timeline reads, timeline UI, notification consumers,
  billing consumers, external sinks, retention, crypto-shredding, PII
  reference-key stores, or GDPR erasure rendering.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy, change billing/Paddle/Stripe behavior, or
  touch README, AGENTS, broad architecture docs, or product UI.

## Why This Slice Next

`T-105b` is now complete for the claim-status event family, so jumping to
`T-206` timeline reads would still be premature: broader `T-105` event
coverage and the future case/recovery split are not in place. Additional PII
reference/key work (`T-104f/g/h`) remains important, but current event payloads
are already fail-closed and sanitized for the only active event family.

`T-103` is the smallest valuable next M1 slice because the tracker names it as
the start of the longest remaining architecture-critical chain:
`T-103 -> T-201 -> T-202 -> T-503`. It creates the additive, dual-written
lifecycle-state foundation needed before the package-level case/recovery split
and before lifecycle states can become authoritative in M2.

`T-106` remains independently valuable, but claim-number and tenant-code
backfills do not unlock the case/recovery state-machine path. `T-108` and
`T-114` remain required for the ida-first front-door model, but they touch
routing/test-lane assumptions and should follow a separately bounded host
contract slice instead of being mixed with lifecycle-state foundation work.

## Verification Bar

- Focused database migration/schema checks for the additive lifecycle-state
  columns.
- Focused domain tests for status-to-case/recovery lifecycle mapping.
- Focused transition tests proving successful status-changing transitions
  persist lifecycle states in the same transaction as status, history,
  lifecycle-version, and domain-event writes.
- Existing claim transition rollback, same-status no-op, projection activation,
  relay/delivery, and audit projection tests remain green.
- `git diff --check`, focused unit/type checks, `pnpm security:guard`,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling is available.
- Repo-scoped MCP `scope_audit` must show no proxy, route, auth, tenancy,
  billing, README, AGENTS, broad architecture docs, or product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  slice adds lifecycle-state schema and transition semantics.
