---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-28
---

# IDA-DG58A — T117B-DATA

> Status: approved sequential child gate. Tier 3. No runtime authority exists before exact
> promotion merge. Promotion base: `b8466b2f4920f6fd1189a547651825f6013fc78a`.

## Outcome

Build the dormant, read-only data and request-context foundation for the member portal: one
request-scoped `React.cache()` session/tenant resolution and exactly two tenant-scoped projection
queries. Projection one returns exhaustive presentation-safe CaseSummary rows for mixed vehicle,
property, and other categories, including document count, next-step token, and `occurredAt`.
Projection two returns the existing canonical `MembershipLifecycleBucket`.

DATA does not mount UI or modify E2E. It cannot add query fan-out, raw category, price, proof, PII,
schema/RLS, auth-provider, routing, PPR, parallel-route, or persisted cache changes.

## Exact writer map

1. `apps/web/src/lib/auth.server.ts`
2. `apps/web/src/components/shell/member-portal-context.ts`
3. `packages/domain-member/package.json`
4. `packages/domain-member/src/case-summary/get-member-case-summaries.test.ts`
5. `packages/domain-member/src/case-summary/get-member-case-summaries.ts`
6. `packages/domain-member/src/case-summary/types.ts`
7. `packages/domain-member/src/index.ts`
8. `packages/domain-member/src/portal-runtime/get-member-portal-membership.test.ts`
9. `packages/domain-member/src/portal-runtime/get-member-portal-membership.ts`
10. `pnpm-lock.yaml`

Writer-map SHA-256:
`18b044d69363404d07682aca7b5944d440cbb1e0066d91cc0cf82578953e3f26`.

## Acceptance

- A whole render tree resolves session and tenant once even when a consumer remains pending for
  more than two seconds; distinct requests never share the resolved object and revocation is seen
  by the next request.
- Query instrumentation counts identity separately and proves exactly two read-only projections,
  both scoped by the session-derived tenant and member; cross-tenant negatives return no rows.
- A mixed vehicle/property/other seed returns every case. Vehicle maps to the accident descriptor;
  other categories use a generic presentation-safe descriptor without raw category, price, proof,
  or PII.
- Membership uses `MembershipLifecycleBucket`; no parallel enum or third aggregate query exists.
- Focused tests, typecheck, modularity, architecture, security, repo-size, admission, and exact
  writer/hash policy are green without skips.

## Sequence and successor

DATA is first. Its deterministic closeout must leave authority inactive before T117B-PORTAL may
promote. T117B-PORTAL consumes only DATA's exported types/functions and remains unmounted.

## Rollback

Before merge, discard only task-owned DATA state. After merge, revert the exact DATA merge. PORTAL
and CUTOVER cannot promote if DATA is absent or its exact proof changes. Reverting DATA after a
later child requires reverting CUTOVER then PORTAL first.

## Exclusions

No member route mount, legacy dashboard mutation, message catalog, E2E, referral/notifications,
T-210 event timeline, T-117C rendering migration, or agent/staff/admin dashboard work.
