---
status: accepted
date: 2026-06-24
owner: platform + architecture + qa
tracker: T-107
---

# ADR-01: Tenant Decomposition

## Status

Accepted.

## Context

Early Interdomestik pilot surfaces overloaded "tenant" to mean several
different things: the authenticated access boundary, country or marketing host,
default booking context, membership contracting entity, and recovery/legal
representation entity. That ambiguity made host-derived tenant assumptions,
cross-jurisdiction recovery, billing, and support access hard to reason about.

The completed architecture evidence now separates those concerns:

- `T-101` made `incident_country_code` an explicit claim fact rather than an
  inference from tenant, host, legal entity, or ambient request context.
- `T-108` and `T-505` established `ida.*` as neutral no-tenant public/login
  entry, with country hosts limited to compatibility/default-booking hints.
- `T-111` added tenant-level `governing_law` and `terms_version` foundations.
- `T-112` added subscription entity-of-record fields: `legal_tenant_id`,
  `billing_entity`, `governing_law_snapshot`, and `terms_version_accepted`.
- `T-301`, `T-302`, and `T-302b` through `T-302d` separated role scope and
  access-tenant proof from persisted tenant identity.

## Decision

Interdomestik uses distinct tenant-context concepts. They must not be collapsed
or inferred from one another:

- `tenant_id` remains the home/storage tenant for existing pilot rows unless a
  separately promoted migration changes that row contract.
- `access_tenant_id` is an authorization and read-scope concept. It may grant
  case-scoped access where approved, but it is not membership identity,
  contracting entity, or recovery legal authority.
- `legal_tenant_id` is the membership or subscription entity of record for
  contracting, invoicing, accepted terms, and governing-law snapshots.
- `recovery_legal_tenant_id` is reserved for incident-country recovery or
  representation authority and must remain distinct from membership entity of
  record.
- Country hosts are compatibility and booking-context aliases. They are not
  tenant identity, access scope, or legal entity authority.
- `ida.*` is neutral public/login entry and starts with no tenant context until
  a valid session or validated booking hint narrows the request.

Any code path that needs more than one of these concepts must name each concept
explicitly at the boundary. Host, cookie, session, booking, access, membership,
and recovery contexts must be resolved in the order documented by the relevant
runtime slice and must fail closed when they conflict.

## Consequences

Positive:

- Tenant isolation, country routing, membership contracting, and recovery
  representation can evolve independently.
- Cross-jurisdiction handoff can use case-scoped access without switching a
  member profile or changing the membership entity of record.
- Billing and legal documents can bind to stored snapshots instead of ambient
  route or host state.

Negative:

- Callers must carry more explicit context fields.
- Compatibility rows will continue to expose overloaded historical names until
  later migrations retire them with dual-read and rollback proof.

## Boundaries

This ADR records accepted architecture only. It does not change runtime code,
proxy behavior, routes, auth/session code, tenant resolution code, schema, RLS,
migrations, billing behavior, Paddle integration, product UI, README, or AGENTS.

`apps/web/src/proxy.ts` remains the sole routing, access-control, and tenant
isolation authority. Canonical routes remain `/member`, `/agent`, `/staff`, and
`/admin`; clarity markers remain contractual E2E signals.

Full legal-entity extraction, billing/entity migration, recovery-entity
handoff, and destructive status or tenant cleanup remain phased work that must
be separately promoted.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/architecture/adr-02-case-recovery-split.md`
- `docs/architecture/adr-05-attribution-read-only.md`
- `docs/architecture/adr-06-ida-neutral-host-live-cutover.md`
- `docs/architecture/adr-09-role-separation-governance-boundaries.md`
- `docs/architecture/adr-10-entity-of-record.md`
