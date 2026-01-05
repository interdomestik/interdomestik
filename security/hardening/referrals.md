# Referrals Module Hardening Checklist

## Status: ✅ Complete

## Security Fixes Applied

### Tenant Scoping

- [x] `get-agent-link.ts` - Query and update scoped to `tenantId`
- [x] `member-referrals/link.ts` - Query and update scoped to `tenantId`
- [x] `member-referrals/stats.ts` - Query scoped to `tenantId`

### RBAC

- [x] `get-agent-link.ts` - Role check: `role === 'agent'`
- [x] Session types include `tenantId` field

### Pagination

- [x] `stats.ts` - Results capped at `MAX_REFERRALS_QUERY = 100`

## Files Modified

- `packages/domain-referrals/src/referrals/types.ts` - Added `tenantId` to session
- `packages/domain-referrals/src/referrals/get-agent-link.ts` - Tenant scoping
- `packages/domain-referrals/src/member-referrals/types.ts` - Added `tenantId` to session
- `packages/domain-referrals/src/member-referrals/link.ts` - Tenant scoping
- `packages/domain-referrals/src/member-referrals/stats.ts` - Tenant scoping + pagination

## Evidence

```
✅ Type check: 11/11 packages pass
✅ Unit tests (Referrals):
   - getMemberReferralLinkCore: 4/4 passed (tenant scoping, RBAC, missing code gen)
   - getAgentReferralLinkCore: 4/4 passed (tenant scoping, RBAC)
```
