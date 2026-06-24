---
status: accepted
date: 2026-06-24
owner: platform + architecture + qa
tracker: T-107
---

# ADR-10: Entity Of Record

## Status

Accepted.

## Context

Membership, billing, tax disclosure, invoice generation, and recovery
representation need a stable contracting entity. Host aliases, booking hints,
access tenants, and incident countries are useful context, but none of them is
safe as the entity of record for a member contract or invoice.

The completed foundation evidence is:

- `T-111` added tenant-level `governing_law` and `terms_version`.
- `T-112` added subscription-level `legal_tenant_id`, `billing_entity`,
  `governing_law_snapshot`, and `terms_version_accepted`.
- `T-408` completed initial billing/entity evidence before role-boundary work.
- ADR-11 records that disclosure, tax, invoice, and contracting-law binding use
  stored subscription or recovery snapshots.

## Decision

The entity of record for membership billing and contracting is the stored
subscription legal entity snapshot, not the request host, active access tenant,
booking tenant hint, country alias, member residence, or incident country.

`subscriptions.legal_tenant_id` identifies the legal tenant/entity of record for
the membership contract. `billing_entity`, `governing_law_snapshot`, and
`terms_version_accepted` preserve the billing and legal posture accepted for
that subscription. Downstream invoice, disclosure, tax, and reconciliation work
must read those stored values instead of recomputing entity authority from
ambient context.

Recovery representation may use a distinct `recovery_legal_tenant_id` when a
separately promoted recovery handoff or representation slice establishes it.
That recovery entity does not rewrite the membership subscription entity of
record.

When an entity changes, migration and recapture work must be explicit: classify
eligibility, preserve history, record accepted terms/legal evidence, prove
rollback or repair posture, and avoid changing active contracts silently.

## Consequences

Positive:

- Billing, tax, and legal documents can rely on durable snapshots.
- Country-host and access-scope changes cannot silently change a member's
  contracting entity.
- Future legal-entity migration has a clear target and evidence burden.

Negative:

- Existing rows that predate entity snapshots need compatibility and migration
  handling.
- Runtime writers must resist recomputing entity-of-record fields from host or
  session state for convenience.

## Boundaries

This ADR records accepted architecture only. It does not change runtime code,
schema, RLS, migrations, billing behavior, Paddle integration, tax logic,
invoice generation, auth/session behavior, proxy behavior, product UI, README,
or AGENTS.

Full entity migration, active-case guarding, acceptance recapture, billing-path
rewiring, and recovery-entity handoff remain separately promoted work.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/architecture/adr-01-tenant-decomposition.md`
- `docs/architecture/adr-11-disclosure-tax-invoice-contracting-law-binding.md`
- `packages/database/src/schema/subscriptions.ts`
- `packages/database/src/schema/tenants.ts`
