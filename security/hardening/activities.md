# Activities Module Hardening Checklist

## Status: ✅ Complete

## Security Fixes Applied

### Tenant Scoping

- [x] `log-lead.ts` - Insert uses `session.user.tenantId`
- [x] `get-lead.ts` - Query scoped to `tenantId`

### RBAC

- [x] `log-lead.ts` - Role check via `ALLOWED_ROLES = ['admin', 'staff', 'agent']`
- [x] Member role explicitly denied

### Input Validation

- [x] `log-lead.ts` - Zod validation with `leadActivitySchema`
- [x] Detailed error messages from Zod issues

### Pagination

- [x] `get-lead.ts` - Results capped at `MAX_ACTIVITIES = 100`
- [x] Optional `limit` parameter with cap enforcement

## Files Modified

- `packages/domain-activities/src/log-lead.ts` - RBAC + validation improvements
- `packages/domain-activities/src/get-lead.ts` - Pagination cap + tenant validation

## Evidence

```
✅ Type check: 11/11 packages pass
✅ Unit tests (Activities):
   - logLeadActivityCore: 5/5 passed (RBAC whitelist, tenant scoping, Zod validation)
```
