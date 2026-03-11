---
applyTo:
  - packages/domain-*/src/**/*.ts
  - packages/shared-auth/src/**/*.ts
---

# Domain quality instructions

Domain packages should stay explicit, testable, and boundary-safe.

- Keep domain modules free of Next.js, React, and UI concerns unless the package already owns that boundary.
- Reuse shared auth and tenant helpers such as `ensureTenantId`, `requireTenantSession`, and `withTenant(...)` instead of duplicating scope logic.
- Favor small focused functions with explicit inputs, outputs, and error handling over convenience wrappers that hide behavior.
- Prefer extending the nearest domain module over adding a new package-level abstraction for a one-off need.
- When domain behavior changes, update or add the closest unit test in the same package.
- Avoid introducing cross-package coupling that bypasses the existing `shared-auth`, database, or domain boundaries.
