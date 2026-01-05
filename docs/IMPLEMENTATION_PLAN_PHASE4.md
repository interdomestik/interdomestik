# Implementation Plan - Phase 4: Users, Settings & Commissions

This phase focuses on hardening the remaining operational domains, specifically focusing on user privacy, financial integrity (commissions), and operational robustness.

## User Review Required

> [!IMPORTANT]
> **Permission Matrix**
>
> - **User Settings**: Individuals update own profile (verified keys); Admins/Staff update tenant-level settings.
> - **Member Notes**: Staff/Admins only (Create/Read/Update/Delete). Members cannot see notes.
> - **Commissions**: Agents view own; Admins/Staff view all and approve. No self-approval.

## Proposed Changes

### [domain-users]

Audit and harden profile management.

- **[MODIFY] `packages/domain-users/src/user-settings/types.ts`**:
  - Add Zod schema for `NotificationPreferences` with strict allowed keys.
- **[MODIFY] `packages/domain-users/src/user-settings/update.ts`**:
  - Validate input with the new schema and return a structured validation error.
- **[MODIFY] `apps/web/src/actions/user-settings/update.core.ts`**:
  - Enforce rate limiting (e.g., `action:user-settings-update` 5/1m) before calling the domain core.
- **[ADD] `packages/domain-users/src/user-settings/update.test.ts`**:
  - Negative test: Member A attempts to update Member B.
  - Validation test: unknown keys rejected.

### [actions/leaderboard]

Harden query safety and prevent data leaks in ranking.

- **[MODIFY] `apps/web/src/actions/leaderboard/types.core.ts`**:
  - Add Zod schema for the `period` input (week | month | all) and future pagination inputs.
- **[MODIFY] `apps/web/src/actions/leaderboard/get.core.ts`**:
  - Apply tenant scoping to the fallback "all ranked" query.
  - Cap fallback results at 100.
  - Validate `period` (and future inputs) using the schema.
- **[UPDATE TEST] `apps/web/src/actions/leaderboard/get.test.ts`**:
  - Add cross-tenant negative test and period validation test.

### [actions/commissions]

Protect financial records from spoofing or unauthorized access.

- **[MODIFY] `packages/database/src/schema/agents.ts`**:
  - Add a `uniqueIndex` for `agent_commissions` on `(subscriptionId, type)` (consider including `tenantId`).
- **[ADD] `packages/database/drizzle/<new_migration>.sql`**:
  - Backing migration for the new unique index.
- **[MODIFY] `packages/domain-membership-billing/src/commissions/create.ts`**:
  - Add idempotency check (lookup by `subscriptionId` + `type`).
  - Normalize amounts to 2-decimal scale and validate currency.
- **[MODIFY] `packages/domain-membership-billing/src/commissions/admin/get-all.ts`**:
  - Add tenant scoping and pagination (cap limit at 100).
- **[MODIFY] `packages/domain-membership-billing/src/commissions/admin/update-status.ts`**:
  - Enforce status transition rules (`pending -> approved -> paid`).
  - Prevent self-approval (admin cannot approve own commission).
- **[ADD] `packages/domain-membership-billing/src/commissions/create.test.ts`**:
  - Idempotency replay test.
- **[ADD] `packages/domain-membership-billing/src/commissions/admin/get-all.test.ts`**:
  - Tenant scoping and pagination caps.
- **[ADD] `packages/domain-membership-billing/src/commissions/admin/update-status.test.ts`**:
  - Transition matrix and self-approval guard.

### [actions/member-notes]

Ensure internal staff notes remain private to the tenant.

- **[MODIFY] `apps/web/src/actions/member-notes.types.core.ts`**:
  - Reduce content max length to 2000 and enforce plain text (no HTML).
- **[MODIFY] `apps/web/src/actions/member-notes/create.core.ts`**:
  - Sanitize content and enforce length before insert.
  - Add tenant scoping to the insert and audit metadata.
- **[MODIFY] `apps/web/src/actions/member-notes/get.core.ts`**:
  - Add tenant scoping to read queries.
- **[MODIFY] `apps/web/src/actions/member-notes/update.core.ts`**:
  - Add tenant scoping and sanitize content on update.
- **[MODIFY] `apps/web/src/actions/member-notes/delete.core.ts`**:
  - Add tenant scoping to note lookup/delete.
- **[MODIFY] `apps/web/src/actions/member-notes/pin.core.ts`**:
  - Add tenant scoping to note lookup/update.
- **[ADD] `apps/web/src/actions/member-notes/create.test.ts`**:
  - Role boundary tests (member blocked) + sanitation.
- **[ADD] `apps/web/src/actions/member-notes/get.test.ts`**:
  - Cross-tenant access blocked.
- **[ADD] `apps/web/src/actions/member-notes/update.test.ts`**:
  - Author vs admin edit rules, cross-tenant blocked.
- **[ADD] `apps/web/src/actions/member-notes/delete.test.ts`**:
  - Author vs admin delete rules, cross-tenant blocked.

## Verification Plan

### Automated Tests

- **User Settings**: `packages/domain-users/src/user-settings/update.test.ts`
- **Leaderboard**: `apps/web/src/actions/leaderboard/get.test.ts`
- **Commissions**: `packages/domain-membership-billing/src/commissions/create.test.ts`
- **Commissions Admin**: `packages/domain-membership-billing/src/commissions/admin/get-all.test.ts`
- **Commissions Admin**: `packages/domain-membership-billing/src/commissions/admin/update-status.test.ts`
- **Member Notes**: `apps/web/src/actions/member-notes/*.test.ts`

### Manual Verification

- Agent A cannot view Agent B's commissions via direct ID manipulation.
- Staff from Tenant X cannot read Member Notes for Tenant Y.
