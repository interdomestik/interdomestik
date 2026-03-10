---
title: C05 Claims-First Scope Tree Evidence
date: 2026-03-09
status: completed
owner: web + platform
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# C05 Claims-First Scope Tree Evidence

## Scope

Publish the claims-first scope tree and referral boundaries across the live commercial surfaces without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Pricing: `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`
- Services: `apps/web/src/app/[locale]/(site)/services/_sections.tsx`
- Member membership operations: `apps/web/src/features/member/membership/components/MembershipOpsPage.tsx`

## Implementation Notes

- Added a shared `ClaimScopeTree` component to keep launch, guidance-only, out-of-scope, and referral-boundary presentation consistent.
- Added localized `scope` copy for `en`, `sq`, `mk`, and `sr` pricing, services, and membership bundles.
- Preserved canonical routes, auth layering, tenancy boundaries, and the proxy contract.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web exec vitest run 'src/app/[locale]/(site)/pricing/_core.entry.test.tsx' 'src/app/[locale]/(site)/services/page.test.tsx' 'src/features/member/membership/components/MembershipOpsPage.test.tsx'
```

Additional checks:

```bash
pnpm --filter @interdomestik/web type-check
pnpm i18n:check
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate:fast
```

## Result

`C05` exit criteria are satisfied: guidance-only categories, out-of-scope categories, and referral boundaries are explicit in the live UI and aligned to the claims-first launch scope.
