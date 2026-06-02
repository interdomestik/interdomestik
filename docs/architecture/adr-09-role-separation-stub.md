---
status: accepted-stub
date: 2026-06-02
owner: platform + architecture + qa
tracker: T-010
---

# ADR-09: Role Separation And Governance Boundaries

## Status

Accepted stub. This record anchors the role-separation direction only. It is not
the final operational role model and does not authorize runtime role changes.

## Context

Architecture Finalization Rev 6 separates technical administration from business
governance and per-country legal-entity administration. The tracker calls for
ADR-09 in M0 so later `T-301`, `T-304`, `T-306`, and related tenant-context work
has a stable decision anchor before implementation.

M0 has already added role exhaustiveness and raw role-array guardrails:

- `T-006` proved role permission exhaustiveness and distinctness in PR `#889`.
- `T-006b` added raw role-array linting in PR `#892`.
- Rev 6 explicitly says detailed operational RACI, pricing roles, discounts,
  recovery terms, finance administration, claims/recovery/agent management, and
  per-country legal-entity administration remain business-governance decisions
  until named owners and processes exist.

## Direction

The target architecture separates these concerns:

- `super_admin` remains a technical platform role, not a blanket business
  governance actor.
- `admin` and `tenant_admin` remain distinct from technical `super_admin` and
  from each other.
- Global governance, finance/pricing approval, legal-entity administration, and
  frontline support access must not collapse into one operational role.
- Separation of duties must block self-approval for sensitive fee, payment,
  recovery-term, discount, legal-entity, and break-glass decisions.
- Break-glass access must be reasoned, time-limited, reviewable, and audited,
  including a future `security.break_glass_used` audit event.
- Cross-jurisdiction or cross-tenant support should use narrowly scoped access
  grants instead of tenant switching or broad admin privileges.

## Non-Decision

This stub does not add `global_support`, `auditor`, pricing, finance, legal,
recovery, or governance roles to runtime code. It does not change permissions,
session claims, route access, proxy behavior, database schema, RLS policies, UI,
or audit-event implementation.

## Follow-Up

Later repo-canonical slices must finalize this ADR when they implement the
runtime role model and governance mechanics. In particular:

- `T-301` owns role de-collapse and break-glass expectations.
- `T-308` owns final ADR-09 completion after the dependent role-boundary work.
- Any operational RACI expansion requires named business owners and explicit
  process decisions before pilot code adds new operational roles.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/plans/2026-06-02-arch-m0-09-closeout-and-t-010-promotion.md`
