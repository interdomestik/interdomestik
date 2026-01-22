# E2E Testing Guidelines

We use Playwright for End-to-End testing.

## Navigation & Locales

**Strict Rule**: Never hardcode locale paths (e.g., `/en/login`, `/sq/member`) or use `page.goto` directly for app pages.

We support multiple tenants (KS, MK) and multiple locales (sq, mk, en). Tests must be locale-agnostic.

### How to navigate

Use the `gotoApp` helper:

```typescript
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test('My Test', async ({ page }, testInfo) => {
  // Navigate to login (automatically picks correct locale for the project)
  await gotoApp(page, routes.login, testInfo, { marker: 'auth-ready' });

  // Navigate with arguments
  await gotoApp(page, l => routes.memberClaimDetail(claimId, l), testInfo, {
    marker: 'page-ready',
  });
});
```

### Readiness Markers

`gotoApp` waits for specific `data-testid` attributes to ensure the page is hydrated and interactive.

- `marker: 'page-ready'` (Default) - Standard for most protected pages.
- `marker: 'auth-ready'` - For Login/Register pages.

## Tenants

Tenant is determined by the **Host**.

- `ks.127.0.0.1.nip.io` -> Kosovo Tenant
- `mk.127.0.0.1.nip.io` -> Macedonia Tenant

Do not assume tenant based on locale.

## CI & Gate

- `pnpm e2e:gate` runs the fast critical path tests (Target: <90s).
- `pnpm e2e:regression` runs the full suite (excluding quarantine/legacy).
- `scripts/check-e2e-locales.sh` runs in CI to prevent hardcoded locale regressions.
