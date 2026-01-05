# Security Hardening: Authentication & Sessions

**Status:** Complete
**Scope:** `packages/shared-auth`, `packages/domain-users`, `apps/web/src/app/api/auth`, `apps/web/src/app/api/cron/_auth.ts`

## Controls Implemented

- **Session validation:** `ensureTenantId()` enforces tenant presence and throws typed errors.
- **RBAC matrix:** `permissions.ts` defines roles and permissions; `requirePermission()` enforces checks in core logic.
- **Tenant/branch/agent scoping:** `scopeFilter()` enforces scope for tenant, branch, agent, and member access.
- **Admin access guards:** `domain-users/admin/access.ts` enforces tenant admin and branch manager boundaries.
- **Cron auth:** `apps/web/src/app/api/cron/_auth.ts` enforces `CRON_SECRET` with no bypass outside tests.

## Verification Commands

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/api/auth/[...all]/route.test.ts
pnpm --filter @interdomestik/web test:unit --run src/app/api/cron/dunning/route.test.ts
pnpm --filter @interdomestik/web test:unit --run src/app/api/cron/engagement/route.test.ts
pnpm --filter @interdomestik/web test:unit --run src/app/api/cron/nps/route.test.ts
```
