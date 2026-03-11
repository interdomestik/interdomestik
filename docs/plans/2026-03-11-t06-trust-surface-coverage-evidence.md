---
title: T06 Trust Surface Coverage Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# T06 Trust Surface Coverage Evidence

## Scope

Close the remaining i18n-proof and component-test gap for the trust surfaces added in `T01` through `T05` without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Trust strip component coverage: `apps/web/src/app/[locale]/components/home/trust-strip.test.tsx`
- Footer safety-net coverage: `apps/web/src/app/[locale]/components/home/footer.test.tsx`
- Free Start trust-copy coverage: `apps/web/src/app/[locale]/components/home/free-start-intake-shell.test.tsx`
- Services trust-surface coverage: `apps/web/src/app/[locale]/(site)/services/page.test.tsx`
- Locale contract coverage: `apps/web/src/messages/commercial-disclaimers.test.ts`

## Implementation Notes

- Audited the trust surfaces introduced by `T01` through `T05` and confirmed that the active `en` and `sq` trust-surface strings already exist in the live message bundles; no new runtime copy or routing changes were required for `T06`.
- Kept the existing `hero-v2` locale coverage in place and tightened the remaining trust-surface component tests so they render against the real `en` and `sq` locale JSON instead of inline ad hoc mocks.
- Added an Albanian completion-flow assertion for the Free Start trust copy so the evidence prompts, privacy note, triage timing, and next-step guidance are all proven on the rendered surface, not only in raw messages.
- Extended the locale contract test to cover hero, trust strip, footer safety net, Free Start trust copy, and `/services` trust copy across `en`, `sq`, `mk`, and `sr`, which preserves the existing `mk` and `sr` surfaces while proving the active `en` and `sq` bundles remain complete.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/hero-v2.test.tsx'` -> passed (`3` tests)
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/trust-strip.test.tsx'` -> passed (`2` tests)
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/footer.test.tsx'` -> passed (`2` tests)
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx'` -> passed (`10` tests)
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(site)/services/page.test.tsx'` -> passed (`4` tests)
- `pnpm --filter @interdomestik/web test:unit --run 'src/messages/commercial-disclaimers.test.ts'` -> passed (`9` tests)
- `pnpm i18n:check` -> passed
- `pnpm plan:audit` -> passed
- `pnpm plan:status` -> passed and reports `T06 [completed]`
- `pnpm pr:verify` -> passed
- `pnpm security:guard` -> passed
- `pnpm e2e:gate` -> passed (`82` tests)

## Result

`T06` exit criteria are satisfied: the trust surfaces from `T01` through `T05` now have direct unit coverage for their key rendering paths, the active `en` and `sq` trust-surface bundles are proven by rendered component tests and locale-contract tests, and the existing `mk` and `sr` trust-surface translations remain intact.
