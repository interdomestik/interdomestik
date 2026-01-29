# Proxy-First Routing & Auth Rendering Contract

## Status: 🔴 NON-NEGOTIABLE ARCHITECTURAL BASELINE

This document defines the core invariants for routing and authentication in Interdomestik V2/V3. These patterns are established to prevent `DYNAMIC_SERVER_USAGE` errors, ensure tenant-aware routing stability, and maintain strict security (CSP/CORS).

---

## 1. The Proxy Authority

`apps/web/src/proxy.ts` is the **single authoritative entry point** for all routing, internationalization, and security logic.

- **Invariant**: `apps/web/src/middleware.ts` must **not** exist.
- **Responsibility**:
  - Tenant resolution (via Host/nip.io).
  - i18n routing (`next-intl`).
  - Auth guards (redirecting unauthenticated users from `/member`, `/admin`, etc.).
  - Security headers (CSP, Origin stability).
- **Reasoning**: Next.js middleware is limited in how it handles dynamic headers and tenant context. The `proxy.ts` pattern provides a bypass for strict static analysis while maintaining performance.

## 2. The Rendering Contract

All authenticated portals must be explicitly **dynamic**.

- **Segments**: `admin`, `agent`, `staff`, `member`.
- **Requirement**: The root `layout.tsx` for each of these segments **must** export:
  ```typescript
  export const dynamic = 'force-dynamic';
  export const revalidate = 0;
  ```
- **Reasoning**: These portals rely on session cookies and tenant-specific headers. Static rendering (SSG) in these segments causes "Dynamic server usage" bailouts and inconsistent auth states.

## 3. Playwright & E2E Parity

E2E tests must run against the **production standalone build** (`next start`).

- **Configuration**:
  - `reuseExistingServer: false` in `playwright.config.ts`.
  - Manual environment loading from `.env.local` (Audit-compliant).
  - Standalone server artifact must be built (`pnpm build`) before gating.
- **Contract Test**: `apps/web/e2e/gate/auth-rendering-contract.spec.ts` must be part of every CI/CD gate. It verifies that authenticated portals return `dynamic` rendering headers.

## 4. Verification Guardrails

The following commands must pass for any baseline change:

1. `pnpm track:audit` (Delivery contract compliance)
2. `pnpm purity:audit` (Architectural isolation)
3. `pnpm build` (Production artifact generation)
4. `playwright test e2e/gate/auth-rendering-contract.spec.ts` (Dynamic contract validation)

---

> [!IMPORTANT]
> Any feature PR that modifies `proxy.ts`, removes `force-dynamic` from portals, or introduces `middleware.ts` is considered a **High Risk** architectural change and must be reviewed against this contract.
