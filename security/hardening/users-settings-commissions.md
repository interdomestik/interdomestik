# Security Hardening: Users, Settings & Commissions

**Status:** Complete
**Scope:** User settings, member notes, leaderboards, commissions

## Controls Implemented

- **User settings**
  - Zod validation (`notificationPreferencesSchema`) rejects unknown keys.
  - Tenant scoping enforced via `withTenant()` in domain update.
  - Rate limiting applied in `actions/user-settings/update.core.ts`.
  - Audit logging records updated keys only (no PII payloads).

- **Member notes**
  - Staff/admin-only access via `canAccessNotes`.
  - Tenant scoping on all note queries and mutations.
  - Content sanitization (plain text only) + 2k length cap.
  - Audit logging on create/update/delete/pin with PII-safe metadata.

- **Leaderboard**
  - Tenant scoping in ranking queries.
  - Result caps for all-rank fallback (`LEADERBOARD_MAX_RESULTS`).
  - Zod validation for `period` input.

- **Commissions**
  - DB-level idempotency via unique index (subscriptionId + type).
  - Create path uses idempotency guard + amount normalization.
  - Admin status transitions enforced with a matrix and no self-approval.
  - Tenant scoping for admin list and status updates.
  - Rate limiting on admin approval actions.
  - Audit logging for admin status updates and bulk approvals.

## Verification Commands

```bash
pnpm --filter @interdomestik/domain-users test:unit
pnpm --filter @interdomestik/domain-membership-billing test:unit
pnpm --filter @interdomestik/web test:unit --run src/actions/user-settings.wrapper.test.ts
pnpm --filter @interdomestik/web test:unit --run src/actions/commissions.admin.wrapper.test.ts
```
