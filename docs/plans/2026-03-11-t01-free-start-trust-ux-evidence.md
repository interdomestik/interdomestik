---
title: T01 Free Start And Trust UX Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# T01 Free Start And Trust UX Evidence

## Scope

Update the live claim-first landing hero, trust strip, and footer safety net so they show proof chips, phone or WhatsApp CTAs, and multilingual trust cues without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Landing hero: `apps/web/src/app/[locale]/components/home/hero-v2.tsx`
- Trust strip: `apps/web/src/app/[locale]/components/home/trust-strip.tsx`
- Footer safety net: `apps/web/src/app/[locale]/components/home/footer.tsx`
- Locale copy: `apps/web/src/messages/en/hero.json`, `apps/web/src/messages/sq/hero.json`, `apps/web/src/messages/mk/hero.json`, `apps/web/src/messages/sr/hero.json`, `apps/web/src/messages/en/trust.json`, `apps/web/src/messages/sq/trust.json`, `apps/web/src/messages/mk/trust.json`, `apps/web/src/messages/sr/trust.json`, `apps/web/src/messages/en/footer.json`, `apps/web/src/messages/sq/footer.json`, `apps/web/src/messages/mk/footer.json`, `apps/web/src/messages/sr/footer.json`

## Implementation Notes

- Replaced the hardcoded UI v2 hero copy with structured `hero.v2` message content so proof chips, journey steps, and multilingual trust cues come from the existing landing-page i18n boundary.
- Added a second trust row in the shared `TrustStrip` so the landing page now shows claim-first scope, phone or WhatsApp support, and multilingual support cues alongside the existing proof stats.
- Added a stronger footer safety-net block with urgent contact CTAs and explicit trust chips, while preserving the existing contact cluster and canonical routes.
- Added focused regression coverage for the hero, trust strip, and footer surfaces.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/hero-v2.test.tsx' 'src/app/[locale]/components/home/trust-strip.test.tsx' 'src/app/[locale]/components/home/footer.test.tsx'
```

Required checks:

```bash
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

## Result

`T01` exit criteria are satisfied: the live claim-first landing surfaces now show proof chips, phone and WhatsApp contact paths, and multilingual trust cues across the hero, trust strip, and footer safety net.
