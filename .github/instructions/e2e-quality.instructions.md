---
applyTo: 'apps/web/e2e/**/*.ts'
---

# E2E quality instructions

Playwright coverage in this repository is contract-oriented and tenant-aware.

- Prefer shared helpers such as `gotoApp(...)`, route builders, fixtures, and seeded flows over ad-hoc URLs or duplicated setup.
- Assert stable contracts first: route behavior, `data-testid` markers, auth boundaries, tenant isolation, and visibility rules.
- Avoid brittle selectors when a stable test id, route helper, or role-based locator already exists.
- Keep tests deterministic across locales and tenants. Use existing fixtures, auth state, and route helpers instead of inline assumptions.
- When page contracts change, update the affected gate or focused E2E spec in the same change.
- Do not weaken gate coverage by replacing specific assertions with broad smoke checks unless the user explicitly asks.
