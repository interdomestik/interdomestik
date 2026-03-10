---
title: C01 Coverage Matrix Evidence
date: 2026-03-10
status: completed
owner: web + platform
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# C01 Coverage Matrix Evidence

## Scope

Publish the launch coverage matrix across pricing, checkout, and member surfaces without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Pricing: `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`
- Checkout: `apps/web/src/app/[locale]/(auth)/register/_core.entry.tsx`
- Member membership: `apps/web/src/app/[locale]/(app)/member/membership/page.tsx`

## Implementation Notes

- Added a shared `CoverageMatrix` renderer and `buildCoverageMatrixProps` content builder so the same included, escalation, referral, later-phase, and unavailable states render consistently across live commercial surfaces.
- Added localized `coverageMatrix` message bundles for `en`, `sq`, `mk`, and `sr`.
- Published matrix rows for launch claim types and boundaries aligned to the blueprint inputs: vehicle damage, property damage, personal injury, guidance-only disputes, and later-phase flight delay compensation.
- Preserved canonical routes, better-auth and shared-auth layering, tenancy boundaries, and the proxy contract.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/components/commercial/coverage-matrix-content.test.ts' 'src/app/[locale]/(site)/pricing/_core.entry.test.tsx' 'src/app/[locale]/(auth)/register/_core.entry.test.tsx' 'src/app/[locale]/(app)/member/membership/page.test.tsx'
```

Additional checks:

```bash
pnpm i18n:check
pnpm type-check
pnpm security:guard
pnpm pr:verify:hosts
pnpm e2e:gate
```

## Result

`C01` exit criteria are satisfied: included, escalation, and referral boundaries are now visible for each launch claim type on the pricing, checkout, and member commercial surfaces.
