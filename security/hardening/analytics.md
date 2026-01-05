# Analytics Module Hardening Checklist

## Status: ✅ Complete

## Security Fixes Applied

### Tenant Scoping

- [x] `get-admin.core.ts` - All queries scoped to `tenantId`
- [x] Explicit tenant validation at function start

### RBAC

- [x] Access check via `isStaffOrAdmin()` helper

### Input Validation

- [x] `types.core.ts` - Added `analyticsQuerySchema` with Zod
- [x] `get-admin.core.ts` - Query params validated against schema
- [x] `daysBack` capped at 90 days max
- [x] `limit` capped at 365 data points max

### Pagination

- [x] Growth data query includes `.limit(limit)`

## Files Modified

- `apps/web/src/actions/analytics/types.core.ts` - Added Zod schema
- `apps/web/src/actions/analytics/get-admin.core.ts` - Validation + tenant check

## Schema Added

```typescript
export const analyticsQuerySchema = z
  .object({
    daysBack: z.number().int().min(1).max(90).optional().default(30),
    limit: z.number().int().min(1).max(365).optional().default(90),
  })
  .strict();
```

## Evidence

```
✅ Type check: 11/11 packages pass
✅ Unit tests (Analytics):
   - getAdminAnalyticsCore: 4/4 passed (Unauthorized check, Missing tenantId, Invalid query inputs)
```
