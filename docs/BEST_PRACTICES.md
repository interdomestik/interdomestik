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
3. Use `pnpm --filter @interdomestik/database migrate` (or `pnpm db:migrate` if wired) to apply changes.
4. Use `drizzle-kit push` only for local/dev throwaway databases.

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

**Baseline CI**:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`

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

### Recommendation: Modularization Guardrails

Keep entrypoints thin and move business logic into core modules:

- Follow `MODULARIZATION_REPORT.md` (thin Next.js entrypoints, logic in `*_core.ts` or domain packages).
- Verify with `node scripts/check-entrypoints-no-db.mjs`.

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

### Recommendation: Hardened Module Standard (Always)

All new features must follow the hardened module checklist and be recorded:

- `security/HARDENING_CHECKLIST.md`
- `security/hardening/INDEX.md`

## 7. Rate Limiting & Audit Logging

### Recommendation: Mandatory Rate Limits for Mutations

- Use `enforceRateLimitForAction` for server actions and `enforceRateLimit` for API routes.
- Ensure headers are forwarded so IP-based rate limiting is accurate.

### Recommendation: Audit on All Mutations

- Use `logAuditEvent` for every create/update/delete.
- Always include `tenantId` and keep metadata PII-safe.

## 8. Tenant Isolation & RLS

### Recommendation: Explicit Tenant Scoping

- Always use `withTenant()` or verified RLS policies for queries.
- Use `ensureTenantId()` for session-derived access.

### Verification Aids

- `node scripts/inspect_policies.js`
- `node scripts/inspect_storage.js`
- `node scripts/abuse_test_rls.js`

## 9. Environment & Secrets Hygiene

### Recommendation: Keep Secrets Local and Auditable

- Use `.env.local` for local secrets and keep `.env.example` in sync.
- Never commit secrets; use pre-commit checks and `scripts/secrets-precommit.sh`.
- Ensure production secrets are set via the hosting platform, not checked into repo.

## 10. Observability

### Recommendation: Error and Audit Visibility

- Keep Sentry configured for client/server/edge.
- Monitor audit log error messages (`Missing tenantId`) as a signal for broken auth flows.

## Summary Checklist

- [ ] **Database**: Switch to `db:migrate` workflow for production.
- [ ] **Maintenance**: Run `knip` to cleanup dead code.
- [ ] **Architecture**: Configure ESLint boundaries.
- [ ] **Architecture**: Enforce modularization guardrails (`*_core.ts`, entrypoint checks).
- [ ] **Testing**: Enable visual regression snapshots for core flows.
- [ ] **Security**: Finalize CSP headers in `next.config.mjs` and follow the Hardened Module Standard.
- [ ] **Security**: Enforce rate limiting + audit logging on all mutations.
- [ ] **Security**: Verify tenant isolation (withTenant/RLS).
