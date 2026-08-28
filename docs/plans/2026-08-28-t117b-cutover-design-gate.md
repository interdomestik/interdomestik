---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-28
---

# IDA-DG58C — T117B-CUTOVER

> Status: disposable pre-freeze child candidate. Tier 3. It may promote only after T117B-DATA and
> T117B-PORTAL are merged and terminally closed. Measurement base:
> `a0d035ada72a96f08a53781e5d892f88e910a474`.

## Outcome

Atomically replace the `/member` legacy presentation with the dormant Unified Portal, start the
two DATA projections from the session-derived context, and migrate the active member behavioral
E2E/golden contracts. No legacy component, compatibility markup, hidden selector, or extra query
is retained merely for historical tests.

## Exact writer map

1. `apps/web/e2e/gate/member-diaspora.spec.ts`
2. `apps/web/e2e/gate/member-home-cta.spec.ts`
3. `apps/web/e2e/golden/member-portal-agent-consumer.spec.ts`
4. `apps/web/e2e/golden/member-dashboard-empty-state.spec.ts`
5. `apps/web/e2e/golden/member-dashboard-has-claims.spec.ts`
6. `apps/web/e2e/production.spec.ts`
7. `apps/web/e2e/smoke/ida-dashboard-smoke.spec.ts`
8. `apps/web/e2e/ui-v2-onboarding.spec.ts`
9. `apps/web/src/app/[locale]/(app)/member/_core.entry.test.tsx`
10. `apps/web/src/app/[locale]/(app)/member/_core.entry.tsx`
11. `apps/web/src/app/[locale]/(app)/member/page.test.tsx`
12. `apps/web/src/app/[locale]/(app)/member/page.tsx`

Writer-map SHA-256:
`a3b7ba9338ba5e453316a55bd499078855c7c911158f43057dc419276d3d749a`.

## Acceptance

- `/member` renders one Unified Portal composition in Case → Actions → Recent case updates order;
  legacy dashboard presentation is absent.
- Integration instrumentation preserves one request-scoped identity resolution and exactly two
  tenant-scoped projection queries, including slow/error/empty sibling states.
- Mixed vehicle/property/other cases have zero omission; membership active/inactive/grace/
  scheduled-cancel actions preserve exact semantics and `?mode=drafts`.
- C31 proves the same per-run summary through save, six-fact resume, and delete without global
  draft cleanup. Diaspora, Help Now, Documents, Membership, and direct agent-as-member consumption
  remain behaviorally proven.
- Eight exact E2E/golden collectors replace legacy presentation assertions. No test is skipped and
  no agent/staff/admin route or E2E infrastructure is changed.
- Exact-head CI/E2E, Sonar/security, final feedback, merge, main health, and closeout are green.

## Sequence and rollback

CUTOVER is last. A single revert of its exact merge restores the legacy member presentation and
its former contracts while merged DATA and PORTAL remain dormant and safe. This is the preferred
runtime rollback. Reverting DATA or PORTAL requires CUTOVER to be reverted first.

## Exclusions

No PPR, cacheComponents, named slots, next.config, route topology, auth provider, tenant/schema,
billing, AI, CI policy, referral/notifications, T-210 event timeline, T-117C, or non-member route
mutation.
