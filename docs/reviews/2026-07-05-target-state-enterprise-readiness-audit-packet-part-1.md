---
status: draft
date: 2026-07-05
owner: platform
review_type: target-state-enterprise-readiness
project: interdomestik
parent: docs/reviews/2026-07-05-target-state-enterprise-readiness-audit-packet.md
---

# Audit Packet Questions — Part 1

## 1. Target State

1. What must Interdomestik look like when it is genuinely enterprise-ready?
2. What should be true of architecture, security, release engineering,
   commercial readiness, operations, and user trust at that point?
3. Which capabilities are mandatory for enterprise readiness, and which are
   optional maturity improvements?
4. What should remain intentionally simple for the next 6 months?
5. What would make you comfortable signing your name under a production launch?

## 2. Current Authority And Development Resumption

1. What is the exact current approved development objective?
2. Is there a merged current-authority or design-gate record authorizing the
   next implementation work?
3. Are we allowed to implement runtime code, or should development remain paused
   pending a fresh gate?
4. Which files or boundaries are explicitly out of bounds?
5. What work is explicitly forbidden right now: auth, routing, tenancy, billing,
   UI overhaul, AI runtime, schema/RLS, destructive migration, or product
   expansion?
6. What must be true before development resumes?

## 3. Architecture

1. Is the current Phase C architecture direction correct: Next.js app, domain
   packages, Drizzle/Postgres, Supabase Auth, better-auth orchestration, and
   Paddle billing?
2. Are boundaries strong enough between `apps/web`, `packages/domain-*`,
   `packages/database`, and `@interdomestik/shared-auth`?
3. Where is hidden coupling likely to hurt multi-country, multi-tenant,
   branch/agent, legal-entity, and recovery-jurisdiction scale?
4. Is the event/outbox direction strong enough for auditability, billing
   consumers, timeline projections, and future reporting?
5. Is the architecture-finalization discipline proportionate to the platform
   risk?
6. Which architectural decisions are already correct and should not be reopened?
7. Which architecture gaps are blocking enterprise readiness?

## 4. Tenant Isolation, Auth, And Roles

1. Is `apps/web/src/proxy.ts` as the routing/access-control authority the right
   boundary?
2. Are `/member`, `/agent`, `/staff`, and `/admin` separated enough in practice?
3. Can stale cookies, forwarded hosts, country hosts, tenant hints, or session
   mismatches still cause tenant leaks?
4. Is the four-context tenant model correct: `host_id`, `booking_tenant_id`,
   `access_tenant_id`, and `legal_tenant_id`?
5. Is `access_tenant_id` consistently the isolation boundary?
6. Are legal entity, booking tenant, recovery legal tenant, and access tenant
   kept separate everywhere?
7. Can persisted `user.role` still grant unintended access?
8. Are `actor_role_on_session`, break-glass, auditor, global support,
   tenant-admin, and super-admin boundaries clear?
9. Are `ida.*` and country-host login flows safe after cutover?
10. What tenant/session edge cases still need proof?

## 5. Security

1. What are the top credible attack paths against Interdomestik?
2. Where could authorization be bypassed outside the proxy?
3. Are all sensitive API routes resolving session, role, tenant, and scope
   before body parsing, database work, storage access, AI work, or billing work?
4. Are RLS policies strong enough, or is the app relying too much on app-layer
   checks?
5. Are service-role Supabase calls fully centralized and guarded?
6. Are storage signed URLs short-lived, non-cacheable, no-referrer, and
   tenant-path asserted?
7. Are CodeQL, gitleaks, dependency audit, custom security guards, and RLS tests
   clean?
8. Are there unresolved high or critical security findings?
9. What issue would force immediate pause, hotfix, rollback, or customer notice?

## 6. Data, Privacy, And Legal Correctness

1. Is GDPR erasure behavior correct and test-proven?
2. Can PII be rendered unreadable while preserving audit/event integrity?
3. Are claim documents, member notes, audit metadata, event PII, storage objects,
   and logs covered?
4. Are data export, correction, deletion, residence change, and legal-entity
   migration flows complete enough?
5. Are governing law, terms version, contracting entity, billing entity, and
   invoice entity captured correctly?
6. Are legal/entity disclosures visible enough before payment and in member
   account surfaces?
7. What legal/compliance gaps would block paid launch?

## 7. Billing And Revenue Correctness

1. Is Paddle integration production-safe enough for the next phase?
2. Are subscription snapshots, invoices, membership status, grace periods,
   failed payments, refunds, and reconciliation reliable?
3. Is success-fee billing safely decoupled through events?
4. Can commission ownership be audited without granting data access?
5. Can finance reconstruct revenue, tax, legal entity, commission, and
   recovery-fee history?
6. What billing mistake would most damage user trust?
7. Is the platform commercially ready to charge users, or only technically able
   to charge?
