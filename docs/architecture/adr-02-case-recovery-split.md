---
status: accepted
date: 2026-06-19
owner: platform + architecture + qa
tracker: T-207
---

# ADR-02: Case And Recovery Split

## Status

Accepted.

## Context

Interdomestik started with one physical `claim` row carrying case intake,
status, documents, recovery, assignment, payment, and timeline concerns. That
single storage row remains useful for pilot compatibility, but it is no longer
the architectural boundary.

The landed proof before this ADR is:

- `T-201` added `domain-case` and `domain-recovery` package boundaries while
  keeping the physical `claim` table and `domain-claims` compatibility facades.
- `T-202` made `case_lifecycle_state` and `recovery_lifecycle_state` the read
  authorities while `status` remains a derived compatibility field for write
  commands, legacy DTO names, history, events, and URL/filter compatibility.
- `T-203`, `T-203b`, and `T-205` enforce recovery prerequisites, lock mutable
  prerequisite rows inside the transition transaction, and prove the case and
  recovery state-machine contracts.
- `T-206` reads the member-visible timeline from `domain_events`, enriching
  only through public `claim_stage_history` rows and excluding actor, internal,
  raw payload, and PII fields.
- `T-208` and `T-208b` derive recovery law and recovery legal tenant from
  explicit `incident_country_code`, with typed unsupported-jurisdiction outcomes
  and no fallback to membership, booking, host, access, or ambient tenant
  context.

## Decision

The case/recovery split is an aggregate and package-boundary split first, not a
physical table split. The physical `claim` row remains the compatibility anchor
until a separately authorized migration removes the need for it.

`domain-case` owns case identity, intake, documents, guidance, member-visible
case lifecycle, and case timeline semantics. Its lifecycle authority is
`claims.case_lifecycle_state`.

`domain-recovery` owns professional recovery eligibility, authorization,
agreement, negotiation, court escalation, resolution, success-fee evidence,
recovery law, and recovery legal-tenant semantics. Its lifecycle authority is
`claims.recovery_lifecycle_state`.

`domain-claims` remains a compatibility and orchestration package while legacy
callers, the central transition command, and existing surfaces still need the
single `claim` row. It must not become the long-term owner for new case-only or
recovery-only concepts when a narrower `domain-case` or `domain-recovery`
contract exists.

## Claims-Row Migration Path

The current migration path is:

1. Keep `claim` as the physical row for pilot compatibility, tenant predicates,
   existing foreign keys, claim numbers, documents, messages, history, and
   legacy screens.
2. Treat `case_lifecycle_state` and `recovery_lifecycle_state` as read
   authority. Use `status` as a write-command and compatibility projection until
   release-cycle dual-read evidence proves removal is safe.
3. Continue dual-writing lifecycle fields through the central
   `transitionClaimStatus()` authority. Do not add direct lifecycle or status
   writers outside that authority.
4. Move new case-only contracts into `domain-case` and new recovery-only
   contracts into `domain-recovery`. Keep `domain-claims` facades only for
   compatibility or central orchestration.
5. Emit and consume durable timeline/audit facts through `domain_events` and
   existing public/private `claim_stage_history` semantics. Member timeline
   rendering may use public stage-history enrichment, but must not expose actor,
   internal, raw payload, or PII fields.
6. Keep `tenant_id` and later `access_tenant_id` as access/isolation concepts.
   Keep membership `legal_tenant_id` and `governing_law` separate from
   recovery-level `recovery_law` and `recovery_legal_tenant_id`.
7. Defer any physical table split, status-column removal, RLS migration, route
   change, or broad DTO rename to a separately promoted migration slice with
   backfill, dual-read, rollback, and release-cycle compatibility proof.

## Access, Legal, And Recovery Boundaries

Access to a case is not the same as legal or recovery authority. Tenant/access
scope controls who can see or operate on data. Membership legal tenant and
governing law describe the member contract. Recovery law and recovery legal
tenant describe the incident-country recovery representation and success-fee
entity.

Unsupported recovery jurisdictions must remain explicit guidance-only or
decline outcomes. They must not default to membership law, membership legal
tenant, booking tenant, host tenant, access tenant, or ambient session context.

Cross-jurisdiction handoff is reserved for `T-209`. When implemented, it may
record `recovery.handed_off_to_jurisdiction`, set or confirm
`recovery_legal_tenant_id`, and create case-scoped access for approved local
recovery/legal actors. It must not grant a full member profile, switch the
membership entity of record, collapse tenants, or broaden the physical
`claim` row into cross-tenant access.

## Consequences

Positive:

- Case and recovery can evolve independently without breaking existing pilot
  storage compatibility.
- Reads have explicit lifecycle authorities instead of inferring every phase
  from one overloaded `status` field.
- Recovery legal/routing decisions remain incident-country scoped and distinct
  from membership and access tenancy.
- `T-209` has a bounded handoff target: audited event plus case-scoped access,
  not tenant switching or profile-wide access.

Negative:

- Some compatibility code will continue to carry both lifecycle fields and
  `status` until the release-cycle migration is authorized.
- The physical `claim` table still contains both case and recovery columns, so
  reviewers must enforce package boundaries and writer authority until a later
  table split is explicitly promoted.

## Boundaries

This ADR records architecture only. It does not implement `T-209`, add
Operational Brain, AI runtime, case intake automation, live decision support,
dashboards, member-facing AI, runtime workflow changes, schema, migrations,
RLS, routes, auth/session changes, proxy changes, billing changes, product UI,
README, or AGENTS updates.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/architecture/adr-04-claim-status-transition-sole-writer.md`
- `docs/architecture/adr-09-role-separation-governance-boundaries.md`
- `packages/domain-case/src/index.ts`
- `packages/domain-recovery/src/index.ts`
- `packages/domain-claims/src/claims/lifecycle-read-model.ts`
- `packages/domain-claims/src/claims/transition.ts`
- `packages/domain-claims/src/claims/transition-domain-events.ts`
