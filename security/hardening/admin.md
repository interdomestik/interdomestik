# Security Hardening: Admin & RBAC

**Status:** Complete
**Scope:** Admin RBAC, Admin Users, Admin Settings

## Controls Implemented

- **RBAC enforcement:** `domain-users/admin/branches.ts` and `roles.ts` enforce `PERMISSIONS.*` with tenant resolution.
- **Zod validation:** Admin RBAC action inputs validated via `domain-users/admin/schemas.ts`.
- **Tenant scoping:** All admin queries use `withTenant()` and `scopeFilter()` for tenant/branch boundaries.
- **Admin users:** `update-user-agent` uses tenant-scoped transaction updates and audit logging.
- **Rate limiting:** `apps/web/src/actions/admin-users.core.ts` rate limits agent assignment updates.
- **Admin settings:** `admin-settings/update.core.ts` validates inputs with Zod, rate limits writes, and records audit logs.

## Verification Commands

```bash
pnpm --filter @interdomestik/domain-users test:unit
pnpm --filter @interdomestik/web test:unit --run src/actions/admin-rbac.wrapper.test.ts
pnpm --filter @interdomestik/web test:unit --run src/actions/admin-users.wrapper.test.ts
pnpm --filter @interdomestik/web test:unit --run src/actions/admin-settings/update.test.ts
```
