---
title: C02 Success Fee Calculator Evidence
date: 2026-03-10
status: completed
owner: web + platform
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# C02 Success Fee Calculator Evidence

## Scope

Ship the public success-fee calculator and worked examples across the live public commercial surfaces without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Pricing: `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`
- Checkout entry: `apps/web/src/app/[locale]/(auth)/register/_core.entry.tsx`
- Home pricing marketing surface: `apps/web/src/app/[locale]/components/home/pricing-section.tsx`

## Implementation Notes

- Added a shared `SuccessFeeCalculator` renderer plus `buildSuccessFeeCalculatorProps` and `calculateSuccessFeeQuote` so pricing, checkout entry, and home pricing surfaces all show the same fee math before any escalation path begins.
- Published the four required worked examples on the public surfaces: standard plan, family plan, minimum-fee, and legal-action-cap scenarios.
- Kept the calculator contract aligned to the blueprint: default success fee stays at `15%` for `Asistenca` and `12%` for `Asistenca+ Family`, both with a `EUR 25` minimum, while the legal-action cap is disclosed separately as a ceiling only after written opt-in.
- Added localized pricing copy for `en`, `sq`, `mk`, and `sr`.
- Preserved canonical routes, auth layering, tenancy boundaries, and the proxy contract.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/components/commercial/success-fee-calculator-content.test.ts' 'src/components/commercial/success-fee-calculator.test.tsx' 'src/app/[locale]/(site)/pricing/_core.entry.test.tsx' 'src/app/[locale]/(auth)/register/_core.entry.test.tsx' 'src/app/[locale]/components/home/pricing-section.test.tsx'
```

Required checks:

```bash
pnpm --filter @interdomestik/web type-check
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

## Result

`C02` exit criteria are satisfied: the standard, family, minimum-fee, and legal-action-cap examples are visible before escalation on the public pricing, checkout-entry, and home commercial surfaces.
