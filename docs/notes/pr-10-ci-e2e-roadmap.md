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

---

## Follow-up Failure: Golden subscription lifecycle (as of 2026-02-01)

### Symptom

- Test: `apps/web/e2e/golden/subscription-lifecycle.spec.ts`
- Failure: missing `data-testid="protection-status"` after registration, then later missing `membership-page-ready` and `subscription-item`.

### Evidence and Root Causes

1. `protection-status` missing on member dashboard
   - Test asserted `getByTestId('protection-status')`.
   - Member dashboard did not render this test id.

2. `membership-page-ready` missing on membership page
   - `gotoApp(..., { marker: 'membership-page-ready' })` timed out.
   - `apps/web/src/app/[locale]/(app)/member/membership/page.tsx` had no marker wrapper.

3. `subscription-item` and `subscription-plan-name` missing
   - Playwright error context showed the subscription row exists, but without expected test ids.
   - `OpsTable` rows use `ops-table-row` by default; membership page never set a row test id.

4. Missing i18n keys in membership ops section
   - `membership.ops.*` keys were missing in `sq` and `mk` locales, causing `MISSING_MESSAGE` errors.

### Fixes Applied

- Member dashboard:
  - Add `data-testid="protection-status"` to the protection badge.
  - Add translations:
    - `dashboard.protection_status.active`
    - `dashboard.protection_status.inactive`
  - Updated `apps/web/e2e/golden/subscription-lifecycle.spec.ts` regex to include mk/sr strings.

- Membership page:
  - Wrap with `data-testid="membership-page-ready"` in
    `apps/web/src/app/[locale]/(app)/member/membership/page.tsx`.

- Membership ops table:
  - Add `rowTestId="subscription-item"` when rendering the ops table.
  - Add `data-testid="subscription-plan-name"` on the plan name span.

- Translations:
  - Add `membership.ops.{title,empty_list,select_subscription,back_to_list}` in
    `apps/web/src/messages/{en,sq,mk,sr}/membership.json`.

### Verification Run (local)

- `pnpm --filter @interdomestik/web run build:ci`
- `pnpm --filter @interdomestik/web run test:e2e -- --project=ks-sq --project=mk-mk apps/web/e2e/golden/subscription-lifecycle.spec.ts`

### Next Checkpoint

- Confirm subscription row test ids are present and the test passes for `ks-sq`, `mk-mk`, and smoke.

---

## Follow-up: Protection status missing due to async dashboard render (2026-02-01)

### Symptom

- PR E2E failed in `subscription-lifecycle.spec.ts` with:
  - `getByTestId('protection-status')` not found after navigating to `/{locale}/member`.

### Root Cause

- `dashboard-page-ready` comes from the layout and can render before
  `MemberDashboardView` finishes (it is an async server component with a Suspense fallback).
- The `protection-status` badge lives in `MemberDashboardView`, so the test was
  asserting too early.

### Fix Applied

- Update the golden test to wait for the member dashboard content to hydrate:
  - `await expect(page.getByTestId('member-dashboard-ready')).toBeVisible({ timeout: 15000 });`

### Why This Is Safe

- No production behavior changes.
- The test now waits for a deterministic marker that only appears once the actual
  dashboard content (including `protection-status`) is rendered.

### Follow-up Adjustment (local regression: ks-sq only)

- Observation: ks-sq sometimes stays on the Suspense fallback and never renders the
  member dashboard content within 15s.
- Decision: Do NOT move test contracts into the skeleton fallback.
- Reason: The contract should only appear when the actual dashboard content is ready.
