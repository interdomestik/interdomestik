---
applyTo: 'apps/web/src/app/**/*.tsx'
---

# Page ready instructions

App Router pages expose contractual clarity markers that the E2E gates depend on.

- Preserve existing `data-testid` markers such as `page-ready`, `landing-page-ready`, `dashboard-page-ready`, `staff-page-ready`, `admin-page-ready`, and other `*-page-ready` variants.
- When adding a new canonical page, include a stable `*-page-ready` marker that matches the page contract.
- If a marker changes, update the corresponding Playwright gate specs under `apps/web/e2e/gate` in the same change.
