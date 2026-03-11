---
title: C03 Free Start And Hotline Disclaimers Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# C03 Free Start And Hotline Disclaimers Evidence

## Scope

Publish Free Start and hotline disclaimers across the live commercial surfaces without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Pricing: `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`
- Services: `apps/web/src/app/[locale]/(site)/services/_sections.tsx`
- Member membership operations: `apps/web/src/features/member/membership/components/MembershipOpsPage.tsx`
- Membership success: `apps/web/src/app/[locale]/(app)/member/membership/success/_core.entry.tsx`
- Membership card: `apps/web/src/app/[locale]/(app)/member/membership/card/_core.entry.tsx`

## Implementation Notes

- Published `Free Start` disclaimer language that states the surface is informational only and does not start human review, legal advice, or staff-led recovery.
- Published hotline disclaimer language that states the hotline is routing-only support and does not imply immediate legal review, claim acceptance, or automatic staff-led handling.
- Kept the disclaimer contract aligned across the commercial surfaces with shared locale coverage in `en`, `sq`, `mk`, and `sr`.
- Added shared message-contract coverage so the disclaimer language remains present and semantically aligned across pricing, services, membership, membership success, and membership card surfaces.
- The implementation landed in merged PR `#283` on March 10, 2026 and is now reconciled into the canonical program and tracker.
- Preserved canonical routes, auth layering, tenancy boundaries, and the proxy contract.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/messages/commercial-disclaimers.test.ts' 'src/app/[locale]/(site)/pricing/_core.entry.test.tsx' 'src/app/[locale]/(site)/services/page.test.tsx' 'src/features/member/membership/components/MembershipOpsPage.test.tsx' 'src/app/[locale]/(app)/member/membership/success/page.test.tsx' 'src/app/[locale]/(app)/member/membership/card/page.test.tsx'
```

Canonical checks:

```bash
pnpm --filter @interdomestik/web type-check
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

## Result

`C03` exit criteria are satisfied: Free Start now states informational-only status and the hotline now states routing-only status everywhere those promises appear on the live commercial surfaces.
