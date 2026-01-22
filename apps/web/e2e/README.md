# E2E Testing Guidelines

We use Playwright for End-to-End testing. To maintain a stable, fast, and multi-tenant compatible suite, we enforce the following strict rules.

## Strict Project Rules

These are non-negotiable standards required for all PRs involving E2E changes.

### 1. Tenant resolution is Host-first, never locale-derived

- Tenant identity must come from the **Host** (e.g., `ks.127.0.0.1.nip.io`) or `x-forwarded-host`.
- Locale segments (e.g., `/sq`, `/mk`, `/en`) control language **only** and must never imply a specific tenant.

### 2. No raw `page.goto()` in specs

- All navigations must use the `gotoApp(page, path, testInfo, {marker})` helper.
- This ensures the correct tenant domain, the correct locale prefix, and consistent readiness waits are applied automatically.

### 3. API calls must never be locale-prefixed

- Never use `/sq/api/...` or `/en/api/...`.
- API calls must use the origin only: `new URL(baseURL).origin + '/api/...'`.

### 4. Selectors must be stable: prefer `data-testid`

- Avoid `getByText(...)` for critical flows, as translations change frequently.
- Use `data-testid` for actions, dialogs, status badges, and "access denied" detection.

### 5. Every navigation must wait for explicit UI readiness markers

- `gotoApp` must wait for a specific marker: `registration-page-root`, `success-page-ready`, `dashboard-page`, etc.
- Do not use "sleep" or `networkidle` as a primary mechanism for stability.

### 6. Tests must be isolated and deterministic

- Avoid storage/cookie leakage between tests.
- Use fresh browser contexts when testing logged-out states (`storageState: undefined`).
- Gate projects must run with minimal dependencies and predictable runtimes.

### 7. Don’t "paper over" contract bugs with coercion

- Helpers like `getLocale` or `normalizeLocale` must fail fast on invalid input types (e.g., receiving an object instead of a string).
- Fix the upstream caller or the TypeScript contract instead of adding permissive hacks.

### 8. CSP / security allowlists must be additive, not destructive

- Never remove production allowlist entries (`paddle.com`, `api.novu.co`, etc.) to make tests pass.
- For CI/Dev environments, conditionally append `nip.io` or `localhost` allowances while keeping the production policy intact.

### 9. Gate vs Golden layering is intentional

- **Gate:** Fast (<90s), minimal, contract-level verification (e.g., "does the pricing page load?").
- **Golden:** Full "Happy Path" lifecycle flows (e.g., Signup -> Subscribe -> Active Dashboard).

## Scope & Governance

Strict rules apply to:

- `e2e/gate/**`
- `e2e/golden/**` (Core flows)

**Exceptions:**

- `e2e/golden/legacy/**`: Specs not yet migrated to strict standards. May contain `page.goto` temporarily.
- `e2e/gate/tenant-resolution.spec.ts`: Allowed to use `page.goto` to validate raw host/redirect/resolution behavior.

---

## Navigation Example

```typescript
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test('Registration Flow', async ({ page }, testInfo) => {
  // Use routes helper with testInfo to get the localized path
  // gotoApp handles the baseURL and marker waiting
  await gotoApp(page, routes.register(testInfo), testInfo, {
    marker: 'registration-page-root',
  });
});
```

## Tenants & Environments

Tenant is determined by the **Host**. In local/CI environments, we use `nip.io` to simulate subdomains without `/etc/hosts` modifications:

- `ks.127.0.0.1.nip.io` -> Kosovo Tenant
- `mk.127.0.0.1.nip.io` -> Macedonia Tenant

## Execution Commands

- `pnpm e2e:gate` - Fast critical path tests.
- `pnpm e2e:regression` - Full E2E suite.
- `scripts/check-e2e-locales.sh` - CI guard to prevent hardcoded locale regressions.
