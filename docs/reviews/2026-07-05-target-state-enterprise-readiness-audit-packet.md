---
status: draft
date: 2026-07-05
owner: platform
review_type: target-state-enterprise-readiness
project: interdomestik
---

# Interdomestik Target-State Enterprise Readiness Audit Packet

> This file is the modular index for the audit packet. It preserves the
> original packet path while keeping detailed questions in companion files under
> the repository modularity guard.

## Purpose

Run a target-state enterprise readiness audit before resuming Interdomestik
development.

The audit should not only answer "what is wrong today?" It should answer what
Interdomestik must become to be a trusted, enterprise-grade, commercially
viable, secure, performant, legally sound, user-trusted, and safely operable
software platform, and what the safest evidence-backed path is from here.

## Audience

Senior developers, release engineers, security reviewers,
product/commercial reviewers, UI/UX reviewers, and operational leaders.

## Current Repo Constraints To Respect

- `apps/web/src/proxy.ts` is the routing and access-control authority.
- Canonical protected routes remain `/member`, `/agent`, `/staff`, and `/admin`.
- Canonical page-ready markers are contractual and E2E-enforced.
- Tenant isolation is mandatory.
- `access_tenant_id`, `booking_tenant_id`, `legal_tenant_id`, and
  `recovery_legal_tenant_id` must remain separate concepts.
- Paddle is the V3 pilot billing provider.
- Supabase Auth is the identity system of record.
- better-auth remains the session/orchestration layer.
- `@interdomestik/shared-auth` remains the auth boundary.
- Domain-driven package boundaries, event/outbox auditability, GDPR erasure,
  document privacy, storage boundaries, and RLS proof remain high-risk areas.
- Broad refactors, expansion, routing/auth/tenant rewrites, billing rewrites,
  AI runtime expansion, and architecture-doc rewrites are out of scope unless
  explicitly justified and authorized by repo authority.

## Audit Method

For each area, answer:

1. What should the enterprise-grade target state look like?
2. What evidence would prove that target state is achieved?
3. What gaps or risks exist today?
4. Which gaps are launch-blocking, enterprise-blocking, or non-blocking?
5. What is the smallest safe sequence of development slices to close the gaps?
6. What should explicitly remain out of scope for now?
7. What stop conditions should block development, block release, or force
   rollback?

## Required Output

The final audit output must include:

1. Executive verdict: can development safely resume now?
2. Target-state definition for the platform.
3. Top enterprise-readiness gaps.
4. Top security and tenant-isolation risks.
5. Top product/commercial risks.
6. Top UI/UX and user-trust risks.
7. Required evidence before launch or scale.
8. Recommended next development slice.
9. Recommended 30/60/90-day roadmap.
10. Stop conditions and rollback triggers.

## Operating Rules For Reviewers

- Be direct and senior-level.
- Challenge weak assumptions.
- Prefer evidence over confidence.
- Distinguish current defects from target-state gaps.
- Distinguish launch blockers from enterprise-scale blockers.
- Do not recommend broad refactors without a concrete safety and evidence case.
- Do not treat "reduces spaghetti" as a sufficient reason to promote work.
- Recommend bounded slices that improve legal/entity correctness, billing and
  revenue correctness, claim/recovery safety, tenant/privacy safety,
  auditability, public trust/pricing clarity, operational safety, or commercial
  KPI evidence.
- If a conclusion depends on missing evidence, say exactly what evidence is
  missing.

## Companion Question Sets

- Architecture, authority, security, privacy, and billing questions:
  `docs/reviews/2026-07-05-target-state-enterprise-readiness-audit-packet-part-1.md`
- Release, performance, operations, AI, product, UX, SDLC, and final decision
  questions:
  `docs/reviews/2026-07-05-target-state-enterprise-readiness-audit-packet-part-2.md`
