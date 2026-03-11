---
title: T05 Services Alignment Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# T05 Services Alignment Evidence

## Scope

Align the public `/services` page to the published coverage-matrix contract so it states included help, staff-led escalation boundaries, and referral-only paths without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Services page server shell: `apps/web/src/app/[locale]/(site)/services/page.tsx`
- Services page sections: `apps/web/src/app/[locale]/(site)/services/_sections.tsx`
- Component coverage: `apps/web/src/app/[locale]/(site)/services/page.test.tsx`
- Disclaimer coverage: `apps/web/src/messages/commercial-disclaimers.test.ts`
- Locale copy: `apps/web/src/messages/en/servicesPage.json`, `apps/web/src/messages/sq/servicesPage.json`, `apps/web/src/messages/mk/servicesPage.json`, `apps/web/src/messages/sr/servicesPage.json`

## Implementation Notes

- Reused the canonical commercial coverage matrix on the existing `/services` surface so the page now shows the same included, escalation, and referral states already published on pricing, checkout, and member surfaces.
- Kept the existing Free Start informational-only and hotline routing-only disclaimer block in place and tightened the surrounding service-card copy so it no longer implies automatic acceptance, legal review, or guaranteed staff handling.
- Replaced the legacy expertise and legal-promise language with explicit included-help, case-acceptance, escalation-agreement, written-opt-in, and referral-only copy that matches the business-model blueprint and tracker exit criteria.
- Kept the change inside the current public site route and message boundary; no routing, auth, tenancy, or proxy code changed.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(site)/services/page.test.tsx'` -> passed (`3` tests)
- `pnpm --filter @interdomestik/web test:unit --run 'src/messages/commercial-disclaimers.test.ts'` -> passed (`5` tests)
- `pnpm i18n:check` -> passed
- `pnpm plan:audit` -> passed
- `pnpm plan:status` -> passed and reports `T05 [completed]`
- `pnpm pr:verify` -> passed
- `pnpm security:guard` -> passed
- `pnpm e2e:gate` -> passed (`82` tests)

## Result

`T05` exit criteria are satisfied in implementation and verification: the public `/services` page now explains included help, the staff-led escalation path, and referral boundaries on the live site surface without over-promising, and the required focused tests, plan checks, PR verification, security guard, and E2E gate all passed in this worktree.
