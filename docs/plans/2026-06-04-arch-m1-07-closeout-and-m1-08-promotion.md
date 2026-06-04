---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
tracker_id: T-101
---

# ARCH-M1-07 Closeout And ARCH-M1-08 Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M1-08`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-04
Authority: closeout and next-slice selection after `ARCH-M1-07`.

## Closeout Basis

`ARCH-M1-07` landed in PR `#936` with squash merge commit
`55179bdb3a1f9eae40bc62831e61de2f0166360b`.

The merged slice completed `T-103` by adding nullable
`case_lifecycle_state` and `recovery_lifecycle_state` claim columns with
nullable-aware database `CHECK` constraints, Drizzle schema and migration
metadata, and focused migration/schema proof.

The domain layer now has a deterministic `ClaimStatus` to case/recovery
lifecycle-state mapping. Draft and submitted initialization paths populate the
mapped lifecycle states, and successful status-changing transitions dual-write
both lifecycle states in the same transaction as the existing status,
`lifecycle_version`, history, domain-event append, and audit-projection
activation path. Same-status no-op transitions continue to avoid lifecycle,
history, and event changes.

This closes the `T-103` lifecycle-state foundation while preserving `status` as
the authoritative read/write field through M2. Lifecycle states are now ready
for the later package split and authoritative-read migration, but those later
steps remain unstarted.

No `domain-case` / `domain-recovery` package split, lifecycle-authoritative
reads, incident-country fields, legal-entity fields, ida-host work, proxy,
routes, auth, tenancy, billing, Stripe, README, AGENTS, broad architecture
docs, or product-surface work was started.

## Promoted Slice

Promote `ARCH-M1-08 -- Incident Country Live Writer Foundation`.

Tracker task: `T-101`.

## Scope

- Add nullable `claims.incident_country_code` and `incident_jurisdiction`
  fields with additive migration/schema changes and the reporting index needed
  by the M1 tracker.
- Wire live claim creation/update writers so new cases persist incident-country
  data from existing repo-owned sources: diaspora, Free Start or query-country
  inputs, and existing `domain-assistance` incident-country logic where it is
  already available.
- Keep live-source mapping preferred over JSON extraction; historical JSON
  backfill and coverage reporting remain `T-102`.
- Keep incident-country data non-authoritative for recovery-law routing until
  the later M2 recovery-law work (`T-208`).
- Add focused proof that applicable new claim creation paths write valid
  incident-country fields and that absent or unsupported inputs remain safely
  nullable.

## Out Of Scope

- Do not run historical backfills or enable backfilled coverage reporting; that
  is `T-102`.
- Do not add legal-entity, governing-law, subscriptions entity-of-record, or
  residence-country fields; those are `T-111`, `T-112`, and `T-113`.
- Do not start ida-host, alias-host, host telemetry, or Playwright tenant-lane
  setup work (`T-108`, `T-109`, `T-110`, `T-114`).
- Do not split `domain-claims` into `domain-case` / `domain-recovery`
  (`T-201`) or make lifecycle states authoritative (`T-202`).
- Do not emit new `case.*`, `recovery.*`, or `membership.*` event families,
  build timeline reads, add billing consumers, or add PII reference/retention
  infrastructure.
- Do not edit `apps/web/src/proxy.ts`, rename or bypass canonical routes,
  refactor auth/session/tenancy/routing, change billing/Paddle/Stripe behavior,
  or touch README, AGENTS, broad architecture docs, or product UI.

## Why This Slice Next

`T-103` is now complete, so `T-201` is technically unblocked. However, `T-201`
is an M2 package-boundary split and remains a larger architectural cut. The
active lane is still closing M1 additive foundations first, and `T-101` is the
smallest remaining M1 schema/writer slice that avoids proxy, route, auth, and
tenancy refactors while creating the incident-country axis needed by later
recovery-law and entity-of-record tasks.

`T-108` is the top remaining M1 host-model task and remains important, but it
touches routing and tenant-resolution assumptions. Under this closeout's strict
Phase C constraints, it should be promoted only through a separately authorized
host/front-door contract slice rather than mixed into incident-country or
case/recovery work.

`T-104f/g/h` remain important for future event PII reference and erasure
posture, but current emitted event payloads are already fail-closed and
sanitized for the active event family. `T-106` is independently useful, but
claim-number and tenant-code backfills do not unlock recovery jurisdiction or
the entity-of-record chain the way `T-101` does.

## Verification Bar

- Focused database migration/schema checks for nullable incident-country and
  incident-jurisdiction fields plus the required index.
- Focused writer tests proving new claim creation/update paths persist mapped
  incident-country data from live inputs without relying on historical JSON
  backfill.
- Focused negative tests proving missing, unsupported, or ambiguous inputs do
  not infer incident jurisdiction from host, tenant, legal entity, or fallback
  defaults.
- Existing claim creation, submit, transition, lifecycle-state, domain-event,
  audit-projection, relay/delivery, and RLS tests remain green.
- `git diff --check`, focused unit/type checks, `pnpm security:guard`,
  `pnpm pr:verify`, and `pnpm e2e:gate` when local tooling and touched surfaces
  require it.
- Repo-scoped MCP `scope_audit` must show no proxy, canonical route, auth,
  tenancy, routing, billing, README, AGENTS, broad architecture-doc, or
  product-surface drift.
- Sonnet architecture/scope review is required before PR readiness because the
  promoted slice chooses dependency order across M1 schema, M2 case/recovery,
  and deferred host-model work.
