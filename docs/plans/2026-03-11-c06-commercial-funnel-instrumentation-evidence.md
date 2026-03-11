---
title: C06 Commercial Funnel Instrumentation Evidence
date: 2026-03-11
status: completed
owner: web + platform
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# C06 Commercial Funnel Instrumentation Evidence

## Scope

Add deterministic analytics events for the active commercial funnel without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Analytics boundary: `apps/web/src/lib/analytics.ts`
- Membership activation tracker: `apps/web/src/components/analytics/funnel-trackers.tsx`
- Claim completion flow: `apps/web/src/components/claims/claim-wizard.tsx`

## Implementation Notes

- Added a shared `CommercialFunnelEvents` helper so the four committed C06 event names are defined once at the canonical analytics boundary.
- Wired `membership_started` to the existing membership-success tracker so the event fires only after activation completes.
- Wired `free_start_completed` to the successful claim-wizard completion path, then derived `escalation_requested` versus `escalation_declined` from the published launch-scope boundary already recorded in `C05`.
- Added targeted regression coverage for the analytics helper, the activation tracker, and both launch-scope and outside-launch-scope claim outcomes.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run src/lib/analytics.test.ts src/components/analytics/funnel-trackers.test.tsx src/components/claims/claim-wizard.ui-v2.test.tsx
```

Required checks:

```bash
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

## Result

`C06` exit criteria are satisfied: `free_start_completed`, `membership_started`, `escalation_requested`, and `escalation_declined` now emit deterministic analytics events from the existing commercial funnel surfaces.
