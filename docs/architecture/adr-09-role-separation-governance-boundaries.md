---
status: accepted
date: 2026-06-15
owner: platform + architecture + qa
tracker: T-308
---

# ADR-09: Role Separation And Governance Boundaries

## Status

Accepted.

## Context

Architecture Finalization Rev 6 separates technical administration from
business governance and per-country legal-entity administration. `T-010`
created this ADR as a stub so later `T-301`, `T-304`, `T-306`, and related
tenant-context work had a stable decision anchor before implementation.

The landed proof is:

- `T-006` proved role permission exhaustiveness and distinctness in PR `#889`.
- `T-006b` added raw role-array linting in PR `#892`.
- `T-301` separated `admin`, `tenant_admin`, technical `super_admin`,
  `global_support`, and `auditor` role/capability boundaries in PR `#1056`.
- `T-301` made governance approval unavailable to technical `super_admin`,
  `global_support`, and `auditor` roles.
- `T-301` required break-glass reason, future expiry, and
  `security.break_glass_used` audit metadata.
- `T-304` separated exercised session role from persisted `user.role` for
  member-surface scope in PR `#1060`.
- `T-306` closed the attribution-as-access risk in PR `#1063`.

## Decision

Role authority is capability based and scope bound. Persisted user role,
exercised session role, tenant/access scope, branch scope, and future
case-scoped grants are distinct inputs. No single role may implicitly collapse
technical administration, business governance, support, audit, tenant
administration, and operational case access.

The accepted role boundaries are:

- `super_admin` is a technical platform role. It can manage platform-wide
  technical concerns and use break-glass when the required metadata is present,
  but it is not a blanket business-governance approver.
- `admin` and `tenant_admin` carry tenant governance approval capability, subject
  to separation-of-duties checks and tenant scope.
- `global_support` is read-oriented support access. It is not governance
  approval, tenant administration, billing authority, or business ownership.
- `auditor` is read-oriented audit access. It is not support mutation,
  governance approval, tenant administration, billing authority, or business
  ownership.
- `branch_manager`, `staff`, `agent`, and `member` remain operational roles whose
  reads and writes stay bounded by their session role and tenant, branch, agent,
  or member scope.

Governance approval must reject self-approval and must not be granted to
technical `super_admin`, `global_support`, or `auditor` roles. Break-glass
access must be reasoned, time-limited, reviewable, and recorded with the
`security.break_glass_used` audit event metadata. Cross-jurisdiction and
cross-tenant support must use explicit scoped access, not tenant switching or
role overloading.

## Consequences

Positive:

- Technical administration, tenant governance, support, audit, and operational
  case access have separate reviewable boundaries.
- Later tenant-context and case-scoped grant work can add access semantics
  without overloading global roles.
- Business-governance approvals have enforceable separation-of-duties checks.

Negative:

- Some workflows need explicit approval or scoped-grant mechanics instead of
  relying on broad administrator access.
- Operational RACI expansion must wait for named business owners and processes.

## Boundaries

This ADR finalizes the architecture decision proven by `T-301`, `T-304`, and
`T-306`. It does not start `T-209`, `T-302`, `T-302b`, broad M3, M5, ida-host,
AI posture, UI/UX overhaul, WS-F/G/H, OMG, DOM, CRM expansion, runtime routing,
auth, tenancy, billing, schema, RLS, proxy, UI, or audit-event implementation.

Detailed operational RACI, pricing roles, discounts, recovery terms, finance
administration, claims/recovery/agent management, and per-country legal-entity
administration remain business-governance decisions until named owners and
processes exist.

## Follow-Up

- Future `T-302/T-302b` work must keep role scope separate from tenant/access
  context and RLS isolation.
- Future `T-209` work must use explicit case-scoped grants, not broad tenant
  switching.
- Any operational RACI expansion requires named business owners and explicit
  process decisions before pilot code adds new operational roles.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/plans/2026-06-02-arch-m0-09-closeout-and-t-010-promotion.md`
- `docs/architecture/adr-05-attribution-read-only.md`
- `packages/shared-auth/src/governance.ts`
- `packages/shared-auth/src/permissions.ts`
