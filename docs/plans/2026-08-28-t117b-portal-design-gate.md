---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-30
---

# IDA-DG58B — T117B-PORTAL

> Status: approved sequential child gate. Tier 3. T117B-DATA product PR `#1658` merged as
> `124ec51cefd022dd7103a4f958cb9ebef5427dad` with product tree
> `728768ab05bc47a0f1cb25ec78ed6a6444264ffc`; closeout PR `#1662` merged as
> `7919f531fffb8f79f14a24750f2bd4654000362d` and authority is inactive. No PORTAL runtime
> authority exists before its exact promotion merge. Promotion base:
> `10635007175e6348017c622c81f5c1917d347662`.

## Outcome

Build the dormant Unified Portal presentation as an ordinary async RSC consumer with Case,
lifecycle-aware Actions, and honest `Recent case updates` regions. Sibling boundaries preserve
independent loading/empty/error behavior. Persistent Help Now, Documents, Membership, and the
structural protective disclaimer remain outside data failures.

Actions preserve exact `?mode=drafts` for `none`, `canceled`, and `grace_expired`; active-family
states lead to case action. Grace and scheduled-cancel states have textual warnings, never
color-only meaning. The portal uses DATA promises and issues no query itself.

## Exact writer map

1. `apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx`
2. `apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx`
3. `apps/web/src/components/dashboard/case-summary/case-kind-registry.ts`
4. `apps/web/src/components/dashboard/case-summary/generic-case-summary.tsx`
5. `apps/web/src/components/dashboard/member-portal-region-boundary.tsx`
6. `apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx`
7. `apps/web/src/components/dashboard/member-portal-runtime.tsx`
8. `apps/web/src/messages/en/dashboard.json`
9. `apps/web/src/messages/mk/dashboard.json`
10. `apps/web/src/messages/sq/dashboard.json`
11. `apps/web/src/messages/sr/dashboard.json`

Writer-map SHA-256:
`60de5ce927812137cfdcd620d280d2708b488040ddf02a5796131d4c6c1f04a5`.

## Acceptance

- Exhaustive accident/generic renderer registry fails compilation/tests when a descriptor is
  missing; safe fields alone reach presentation.
- Case, Actions, and Recent case updates have distinct semantic headings and independent states;
  loading is not a live status, empty state is explicit, and error uses an alert boundary.
- Disclaimer is a semantic landmark and remains visible when every region suspends, empties, or
  fails. Accessible names do not hide visible text.
- Keyboard order, visible focus, target sizes, reduced motion, and overflow are proven at
  320/768/1440 in the bounded browser harness.
- Only the four exact `dashboard.json` locale catalogs receive ownership. Every other catalog
  remains default-denied.
- No route/page/core/E2E path changes in this child; the portal remains dormant.

## Sequence and successor

PORTAL follows closed DATA and must close out with authority inactive. T117B-CUTOVER is the sole
consumer that may mount it. The CUTOVER admission binds the exact DATA and PORTAL writer hashes.

## Rollback

Before merge, discard task-owned PORTAL state. After merge but before CUTOVER, revert the exact
PORTAL merge with no runtime impact. After CUTOVER, revert CUTOVER first; DATA remains safe and
dormant, then PORTAL may be reverted independently.

## Exclusions

No member route cutover, legacy compatibility markup, query, auth/session primitive, PPR,
parallel routes, next.config, referral/notifications, T-210 event timeline, T-117C, or other role
dashboard work.
