# Security Hardening: Claims Management

**Status:** ✅ Complete
**Date:** 2026-01-05
**Focus:** Validation, RBAC, Rate Limiting, Audit Logging

## Checklist

### 1. Domain Hardening (`domain-claims`)

- [x] **Zod Validation**: Defined `claimStatusSchema` and `assignClaimSchema` in `validators/claims.ts`.
- [x] **Strict Transitions**: `updateClaimStatusCore` validates status transitions against allowed list.
- [x] **Staff Assignment**: `assignClaimCore` prevents staff from assigning other staff (self-assignment only for staff, full assignment for admin).
- [x] **Tenant Scoping**: All queries use `withTenant` guard.
- [x] **Audit Logging**: Enforced `tenantId` in all audit logs. Logs strict error and aborts log write if missing (fails open for availability).

### 2. Actions Hardening (`apps/web/src/actions`)

- [x] **Rate Limiting & Validation**:
  - `admin/claims/update`: 20/60s + **Action-Side Zod Validation**.
  - `agent/claims/update`: 10/60s + Rate Limit (Validation in Domain).
  - `staff/claims/update`: 20/60s + Rate Limit (Validation in Domain).
  - `submitClaimCore`: 1/10s + Idempotency.
  - `uploadVoiceNote`: 5/10m.
- [x] **Idempotency**: Implemented via rate limit window.

### 3. File Uploads

- [x] **MIME Type Validation**:
  - Evidence: Strict whitelist (`image/jpeg`, `image/png`, `application/pdf`).
  - Voice Notes: Magic byte inspection + file extension + MIME type correlation (`audio/webm`, `audio/mp4`, etc.).
- [x] **Size Limits**: Enforced 10MB limit.

## Evidence

```
✅ Type check: 11/11 packages pass
✅ Unit tests (Claims Domain):
   - status.test.ts: 3/3 passed (Invalid status, Unauthorized member, Tenant scoping)
   - assign.test.ts: 3/3 passed (Tenant scoping, RBAC violation by staff, Admin access)
✅ Unit tests (Actions Hardening):
   - submit.test.ts: 3/3 passed (Rate limiting, Validation errors)
   - claims-hardening.test.ts: 4/4 passed (Admin/Agent/Staff Rate limiting & Zod Validation)
```

## Next Steps

- Monitor audit logs for `Missing tenantId` errors (should be zero).
- Consider adding DB-level uniqueness constraint for claim submission tokens if higher strictness needed.
