---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-02
---

# IDA-DG58C — T117B-CUTOVER

> Status: approved Tier-3 child on base `b98f4d1948ff6eb38227f74547e0628c7e7b1660`.
> T117B-DATA and T117B-PORTAL are exact merged and terminally closed predecessors. Runtime is
> denied before promotion.

## Outcome

Mount the dormant Unified Portal at `/member`, start two DATA projections from session context,
and migrate active member E2E/golden contracts. Remove legacy presentation without compatibility
UI, hidden selectors, or extra queries.

## Exact writer map

1. `apps/web/e2e/dashboard-access.spec.ts`
2. `apps/web/e2e/gate/member-diaspora.spec.ts`
3. `apps/web/e2e/gate/member-home-cta.spec.ts`
4. `apps/web/e2e/golden/agent-member-overlay.spec.ts`
5. `apps/web/e2e/golden/member-dashboard-empty-state.spec.ts`
6. `apps/web/e2e/golden/member-dashboard-has-claims.spec.ts`
7. `apps/web/e2e/golden/member-portal-agent-consumer.spec.ts`
8. `apps/web/e2e/production.spec.ts`
9. `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`
10. `apps/web/e2e/ui-v2-onboarding.spec.ts`
11. `apps/web/src/app/[locale]/(app)/member/_core.entry.test.tsx`
12. `apps/web/src/app/[locale]/(app)/member/_core.entry.tsx`
13. `apps/web/src/app/[locale]/(app)/member/page.test.tsx`
14. `apps/web/src/app/[locale]/(app)/member/page.tsx`
15. `apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx`
16. `apps/web/src/components/dashboard/member-portal-runtime.tsx`
17. `apps/web/src/messages/en/dashboard.json`
18. `apps/web/src/messages/mk/dashboard.json`
19. `apps/web/src/messages/sq/dashboard.json`
20. `apps/web/src/messages/sr/dashboard.json`

Writer-map SHA-256:
`9607ebda8ed38b016aefedaec045e22e6ab195b06371d2706ce0f3da9260bf36`.

## Acceptance

- `/member` renders one Case → Actions → Recent case updates portal; legacy UI is absent.
- One request-scoped identity and exactly two tenant projections cover slow/error/empty siblings.
- Mixed cases, membership lifecycle, and neutral-host/default-tenant `?mode=drafts` stay exact.
- C31 preserves one run through save, six-fact resume, and delete without global cleanup; diaspora,
  Help Now, Documents, Membership, and agent-as-member behavior remain proven.
- Ten E2E/golden collectors pass without skips or agent/staff/admin and infrastructure changes.
- Exact-head CI/E2E, Sonar/security, feedback, merge, main health, and closeout are green.

## Sequence and rollback

CUTOVER is last. Revert its exact merge to restore legacy UI while DATA and PORTAL remain dormant;
revert CUTOVER before either predecessor.

## Exclusions

No PPR/cacheComponents/named slots, next.config, routing, auth, tenancy/schema, billing, AI, CI,
provider, T-117C, or non-member mutation.
