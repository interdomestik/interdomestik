---
status: accepted
date: 2026-06-15
owner: platform + architecture + qa
tracker: T-308
---

# ADR-05: Attribution Is Read-Only

## Status

Accepted.

## Context

Interdomestik needs attribution for sales, referrals, assistance funnels,
partner reporting, and commission ownership. That attribution is commercially
important, but it must not become an access-control shortcut.

Before the `T-306` consolidation, attribution-like signals could be confused
with active read-scope relationships. That created a risk that an agent,
partner, reporting, finance, or sales actor could gain claims, recovery,
document, or medical visibility because they originated, assisted, or were
commercially attached to a membership.

The landed proof is:

- `T-304` established that exercised session role, not persisted user role,
  confers member-surface scope.
- `T-306` made membership attribution durable and read-only in PR `#1063`.
- `T-306` revoked stale read-scope bindings instead of replacing them with new
  grants.
- `T-306` kept commission payability tied to durable subscription ownership
  rather than active read-scope rows.

## Decision

Attribution records commercial provenance only. Attribution may identify who
originated, assisted, referred, sold, or owns commission eligibility for a
membership, but it never grants data access.

Claims, recovery, document, medical, case, and member-detail reads must be
authorized by the explicit session role, tenant/access scope, branch scope,
case-scoped grant, or future `access_tenant_id` isolation model. They must not
be authorized from attribution fields, commission ownership, referral codes,
lead conversion provenance, `agentId`, `assistedByAgentId`, or historical
agent-client bindings.

Attribution may flow to:

- commission ownership and payability checks;
- sanitized membership-attribution events;
- aggregate reporting and funnel projections;
- audit or diagnostic evidence that does not expose protected case content.

Attribution must not flow to:

- claims, recovery, document, medical, or case-detail read permission;
- tenant switching or cross-tenant scope;
- route, proxy, or session-role elevation;
- RLS policy expansion;
- Paddle or billing authority beyond commission ownership/payability evidence.

## Consequences

Positive:

- Sales, partner, finance, and reporting workflows can use attribution without
  inheriting sensitive operational access.
- Commission ownership remains payable after read-scope bindings are revoked.
- Later `domain-sales`, `domain-reporting`, and CQRS projection work can consume
  attribution facts without widening core table access.

Negative:

- Any actor that needs operational case access must receive an explicit
  authorization path separate from attribution.
- Legacy code that treated active agent-client bindings as both attribution and
  read scope must continue to be decomposed in bounded slices.

## Boundaries

This ADR records the architecture decision proven by `T-306`. It does not add
runtime roles, route access, tenant context, schema, RLS, billing behavior,
proxy behavior, UI, reporting projections, or new sales/partner domains.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/architecture/adr-09-role-separation-governance-boundaries.md`
- `packages/domain-membership-billing/src/ownership-attribution.ts`
- `packages/domain-membership-billing/src/commissions/ownership.ts`
