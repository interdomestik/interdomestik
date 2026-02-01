# PR #10 CI E2E Failure Roadmap

Goal: Fix CI failures in PR E2E and CI e2e-gate for `apps/web/e2e/gate/subscription-contract.spec.ts`.

## Current Failure (as of 2026-02-01)

- Check: PR E2E (Strict Gate + Key Golden) → `e2e` job
- Check: CI → `e2e-gate` job
- Symptom: test `Logged in Join Now triggers checkout (Contract only)` stays on `/mk/pricing` (and `/sq` for KS) instead of redirecting to `/member/membership/success?test=true`.

## Timeline of Fixes and Evidence

1. Missing standalone build

- Error: webServer could not find `.next/standalone/**/server.js`.
- Fix: Added `pnpm --filter @interdomestik/web run build:ci` in `.github/workflows/e2e-pr.yml` before any Playwright runs.

2. Billing test mode not applied during gate E2E

- Error: test still stayed on `/pricing`.
- Fix: Forced `NEXT_PUBLIC_BILLING_TEST_MODE=1` for gate runs:
  - `apps/web/package.json` → prefixed `e2e:gate` and `e2e:gate:fast` commands.

3. Runtime test mode signal and dynamic pricing

- Hypothesis: pricing page could be static, freezing `NEXT_PUBLIC_BILLING_TEST_MODE` at build time.
- Fixes:
  - `apps/web/src/app/[locale]/(site)/pricing/page.tsx`:
    - `export const dynamic = 'force-dynamic';`
    - `export const revalidate = 0;`
  - `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`:
    - added `data-billing-test-mode="1|0"` and a hidden marker `data-testid="pricing-page"`.
  - `apps/web/e2e/gate/subscription-contract.spec.ts`:
    - assert billing mode is `1` before CTA click
    - assert redirect unconditionally (no env guard).

4. Paddle mock timing and contract check

- Issue: `page.addInitScript()` was added after navigation, so it did not apply to the loaded document.
- Fix (current):
  - Move `addInitScript` before navigation to pricing.
  - In billing test mode, throw if `Paddle.Checkout.open` is called.
  - This prevents masking real failures and surfaces contract regressions.

## Current State of Evidence

Root cause identified locally:

- The pricing page loaded without client hydration because `/_next/static/*` assets were 404ing.
- Evidence: many 404s for `/_next/static/chunks/*.js|*.css`, and CTA click never triggered client navigation.

## Fix Applied

- Ensure static assets are available to the standalone server by linking the build output into the expected paths.

## Files Touched

- `.github/workflows/e2e-pr.yml`
- `apps/web/package.json`
- `apps/web/src/components/pricing/pricing-table.tsx`
- `apps/web/src/app/[locale]/(site)/pricing/page.tsx`
- `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx`
- `apps/web/e2e/gate/subscription-contract.spec.ts`
- `scripts/e2e-webserver.sh`

## Principle for Future Fixes

- Do not force redirects inside Paddle mocks.
- Use deterministic runtime signals (`data-billing-test-mode`) and fail fast when contracts break.
- Ensure Playwright init scripts run before navigation.
