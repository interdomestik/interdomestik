# Recommended Best Practices for Interdomestik v2

Based on an analysis of the current technology stack (Next.js 16, Turbo, Drizzle, Supabase, TypeScript), the following best practices are recommended to enhance stability, maintainability, and scalability.

## 1. Database Management

### Current Status

- **Stack**: Drizzle ORM + Postgres (Supabase).
- **Observation**: `package.json` uses `db:push` (`drizzle-kit push`).
- **Risk**: `db:push` syncs the schema directly without history. It is destructive and risky for production environments.

### Recommendation: Formal Migration Workflow

Transition to a migration-based workflow using `drizzle-kit generate` and `drizzle-kit migrate`. This ensures:

- **Version Control**: Database changes are tracked in git.
- **Rollback Capability**: You can revert changes if deployments fail.
- **Safety**: Prevents accidental data loss in production.

**Implementation**:

1. Remove `db:push` usage for production-facing flows.
2. Use `pnpm db:generate` to create SQL migration files.
3. Use `pnpm db:migrate` (verified script needed) to apply changes securely.

## 2. Code Quality & Dead Code Elimination

### Current Status

- **Stack**: Monorepo with `apps/web` and `packages/domain-*`.
- **Observation**: Monorepos tend to accumulate unused exports and dependencies over time.

### Recommendation: Integrate `knip`

Add [Knip](https://knip.dev/) to the CI pipeline. Knip analyzes the monorepo to find:

- Unused files and exports.
- Unused dependencies in `package.json`.
- Missing Typescript definitions.

**ROI**: Drastically reduces bundle size and maintenance overhead by deleting dead code.

## 3. Architecture & Boundaries

### Current Status

- **Stack**: Domain-driven design (`@interdomestik/domain-*`).
- **Observation**: Good separation, but dependency rules are implicit.

### Recommendation: Strict Dependency Boundaries

Enforce architectural rules using `eslint-plugin-boundaries` to prevent "spaghetti code":

- **Web App**: Can import from `domain-*`, `ui`, `shared-*`.
- **Domains**: Can import `shared-*` and `database`. **Cannot** import `web` or `ui`.
- **Shared**: **Cannot** import `domain-*` or `web`.

This prevents circular dependencies that break builds and slow down development.

## 4. Testing Strategy

### Current Status

- **Stack**: Vitest (Unit), Playwright (E2E).
- **Observation**: Strong coverage on logic, but UI regressions are hard to catch.

### Recommendation: Visual Regression Testing

Leverage Playwright's visual comparison features for critical UI components (e.g., Claims Dashboard, Member Profile).

- **Why**: CSS changes in global styles (Tailwind) can accidentally break unrelated pages.
- **How**: Add `await expect(page).toHaveScreenshot()` to critical E2E flows.

## 5. Performance Monitoring

### Current Status

- **Stack**: Next.js 16, Vercel/Self-hosted(?).
- **Observation**: `@next/bundle-analyzer` is present.

### Recommendation: Bundle Budgeting

Enforce bundle size limits in CI.

- If a main chunk exceeds 200KB (gzipped), fail the build or warn.
- Prevents accidental import of heavy libraries (e.g., full `lodash` instead of `lodash/debounce`) into client bundles.

## 6. Security Hardening (Continuous)

### Current Status

- **Stack**: Zod, Better Auth, RBAC.
- **Observation**: Hardening is active (Phase 1-6 complete).

### Recommendation: Content Security Policy (CSP)

Implement a strict CSP header to mitigate XSS.

- **Strict-Dynamic**: For scripts.
- **Frame-Ancestors**: Prevent clickjacking.
- **Connect-Src**: Whitelist API endpoints (Supabase, Paddle, Novu).

## Summary Checklist

- [ ] **Database**: Switch to `db:migrate` workflow for production.
- [ ] **Maintenance**: Run `knip` to cleanup dead code.
- [ ] **Architecture**: Configure ESLint boundaries.
- [ ] **Testing**: Enable visual regression snapshots for core flows.
- [ ] **Security**: Finalize CSP headers in `next.config.mjs`.
