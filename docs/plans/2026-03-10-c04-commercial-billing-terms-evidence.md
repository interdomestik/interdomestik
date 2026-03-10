---
title: C04 Commercial Billing Terms Evidence
date: 2026-03-10
status: completed
owner: web + platform
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# C04 Commercial Billing Terms Evidence

## Scope

Publish annual billing, cancellation, refund, and cooling-off terms across the live commercial surfaces without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Pricing: `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`
- Checkout entry: `apps/web/src/app/[locale]/(auth)/register/_core.entry.tsx`
- Member settings: `apps/web/src/app/[locale]/(app)/member/settings/_core.entry.tsx`
- Legal terms and refund policy: `apps/web/src/app/[locale]/(site)/legal/terms/_core.entry.tsx`, `apps/web/src/app/[locale]/(site)/legal/refund/_core.entry.tsx`
- Home pricing marketing surface: `apps/web/src/app/[locale]/components/home/pricing-section.tsx`

## Implementation Notes

- Added a shared `CommercialBillingTerms` renderer and `buildCommercialTermsProps` content builder so the same annual billing, cancellation, refund-window, cooling-off, and accepted-matters language renders consistently across pricing, checkout, settings, legal, and home pricing surfaces.
- Added localized `commercialTerms` bundles for `en`, `sq`, `mk`, and `sr`.
- Removed the public monthly-billing presentation from the pricing table and home pricing surfaces so the UI aligns with the annual-only contract defined in the blueprint.
- Updated the legal terms and refund pages to restate the same contractual language instead of drifting to separate refund wording.
- Preserved canonical routes, auth layering, tenancy boundaries, and the proxy contract.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/components/commercial/billing-terms-content.test.ts' 'src/app/[locale]/(site)/pricing/_core.entry.test.tsx' 'src/app/[locale]/(auth)/register/_core.entry.test.tsx' 'src/app/[locale]/(app)/member/settings/_core.entry.test.tsx' 'src/components/pricing/pricing-table.test.tsx' 'src/app/[locale]/components/home/pricing-section.test.tsx'
```

Additional checks:

```bash
pnpm --filter @interdomestik/web type-check
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

## Result

`C04` exit criteria are satisfied: checkout, pricing, and member settings now expose the same annual billing, cancellation, refund, and cooling-off rules, with matching legal-language support on the public terms and refund pages.
