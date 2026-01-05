# Implementation Plan - Phases 1-3 (Hardening + Modularization Guardrails)

This plan updates the remaining Phase 1–3 hardening work with precise file targets. It also follows the modularization policy from `MODULARIZATION_REPORT.md` (keep entrypoints thin; push logic into `*_core.ts` or domain packages).

## Modularization Hardening Guardrails

- **[REFERENCE] `MODULARIZATION_REPORT.md`**: keep changes in domain modules or `*_core.ts` files, not entrypoints.
- **[REFERENCE] `scripts/check-entrypoints-no-db.mjs`**: ensure no DB usage in entrypoints after hardening changes.
- **[UPDATE] `MODULARIZATION_REPORT.md`**: add a short entry if any new core modules are created.

---

# Phase 1: Critical Domains

## 1) Authentication & Sessions (shared-auth, domain-users)

- **[MODIFY] `packages/shared-auth/src/session.ts`**:
  - Harden session validation paths and tenant ID requirements.
- **[MODIFY] `packages/shared-auth/src/permissions.ts`**:
  - RBAC matrix audit (admin vs tenant_admin vs staff vs agent).
- **[MODIFY] `packages/shared-auth/src/scope.ts`**:
  - Ensure tenant scoping is consistent for session-derived access.
- **[MODIFY] `packages/domain-users/src/admin/access.ts`**:
  - Centralize tenant admin checks and return consistent error shapes.
- **[MODIFY] `apps/web/src/app/api/auth/[...all]/_core.ts`**:
  - Validate inputs and map errors to consistent responses.
- **[MODIFY] `apps/web/src/app/api/cron/_auth.ts`**:
  - Enforce strict cron auth and deny bypass flags outside tests.
- **[ADD] `packages/domain-users/src/admin/access.test.ts`**:
  - Role boundary tests for admin/tenant_admin/staff/agent.
- **[ADD] `apps/web/src/app/api/cron/_auth.test.ts`**:
  - Positive and negative cron auth tests.

## 2) Claims Management (domain-claims + actions + API)

- **[MODIFY] `packages/domain-claims/src/validators/claims.ts`**:
  - Extend schemas for status/assignment inputs.
- **[MODIFY] `packages/domain-claims/src/claims/status.ts`**:
  - Normalize error handling to structured results.
- **[MODIFY] `packages/domain-claims/src/agent-claims/assign.ts`**:
  - Validate input with Zod and enforce staff-only assignment rules.
- **[MODIFY] `packages/domain-claims/src/agent-claims/update-status.ts`**:
  - Enforce status transitions and ensure staff assignment checks.
- **[MODIFY] `packages/domain-claims/src/staff-claims/assign.ts`**:
  - Add assignment guardrails and audit logging.
- **[MODIFY] `packages/domain-claims/src/staff-claims/update-status.ts`**:
  - Enforce assignment scoping + consistent error types.
- **[MODIFY] `packages/domain-claims/src/admin-claims/update-status.ts`**:
  - Normalize status transition + error shape + audit metadata.
- **[MODIFY] `apps/web/src/actions/claims/submit.core.ts`**:
  - Add idempotency guard (prevent duplicate submissions).
- **[MODIFY] `apps/web/src/actions/claims/status.core.ts`**:
  - Add rate limit and error mapping.
- **[MODIFY] `apps/web/src/actions/agent-claims/assign.core.ts`**:
  - Add rate limit + Zod parsing before domain call.
- **[MODIFY] `apps/web/src/actions/agent-claims/update-status.core.ts`**:
  - Add rate limit + Zod parsing before domain call.
- **[MODIFY] `apps/web/src/actions/staff-claims/assign.core.ts`**:
  - Add rate limit + Zod parsing before domain call.
- **[MODIFY] `apps/web/src/actions/staff-claims/update-status.core.ts`**:
  - Add rate limit + Zod parsing before domain call.
- **[MODIFY] `apps/web/src/actions/admin-claims/update-status.core.ts`**:
  - Replace raw FormData parsing with Zod validation.
- **[MODIFY] `apps/web/src/app/api/uploads/_core.ts`**:
  - Align MIME allowlist with voice note requirements.
- **[MODIFY] `apps/web/src/actions/uploads/upload.ts`**:
  - Ensure allowed MIME list matches API upload constraints.
- **[UPDATE TEST] `packages/domain-claims/src/claims/status.test.ts`**:
  - Add negative tests (unauthorized, invalid status).
- **[UPDATE TEST] `packages/domain-claims/src/agent-claims/assign.test.ts`**:
  - Add cross-tenant and staff-assignment checks.
- **[ADD] `apps/web/src/actions/claims.test.ts`**:
  - Add idempotency and rate-limit coverage.
- **[UPDATE] `security/hardening/claims.md`**:
  - Update checklist items and evidence section.

## 3) Membership & Billing (Paddle + subscriptions)

- **[MODIFY] `packages/domain-membership-billing/src/paddle-webhooks/verify.ts`**:
  - Enforce signature validation and reject bypass outside tests.
- **[MODIFY] `packages/domain-membership-billing/src/paddle-webhooks/handle.ts`**:
  - Add idempotency guard on webhook event IDs.
- **[MODIFY] `packages/domain-membership-billing/src/paddle-webhooks/persist.ts`**:
  - Persist webhook receipt + idempotency key lookup.
- **[MODIFY] `packages/domain-membership-billing/src/paddle-webhooks/handlers/subscriptions.ts`**:
  - Enforce valid subscription status transitions.
- **[MODIFY] `packages/domain-membership-billing/src/paddle-webhooks/handlers/transaction.ts`**:
  - Validate transaction payload schema and currency.
- **[MODIFY] `apps/web/src/app/api/webhooks/paddle/_core.ts`**:
  - Zod validation of payload and error mapping.
- **[UPDATE TEST] `packages/domain-membership-billing/src/paddle-webhooks/handlers.test.ts`**:
  - Add idempotency and signature verification tests.
- **[ADD] `packages/domain-membership-billing/src/paddle-webhooks/verify.test.ts`**:
  - Explicit signature failure coverage.
- **[ADD] `security/hardening/membership-billing.md`**:
  - Track hardening status and evidence.

---

# Phase 2: Core Operations

## 1) Admin Functions (admin-\* actions)

- **[MODIFY] `apps/web/src/actions/admin-rbac.core.ts`**:
  - Confirm role boundaries (super admin vs tenant admin).
- **[MODIFY] `apps/web/src/actions/admin-users/get-users.core.ts`**:
  - Add tenant scoping + pagination validation.
- **[MODIFY] `apps/web/src/actions/admin-users/update-user-agent.core.ts`**:
  - Add Zod validation and audit logging.
- **[MODIFY] `apps/web/src/actions/admin-settings/update.core.ts`**:
  - Enforce strict allowed keys and rate limit.
- **[MODIFY] `apps/web/src/actions/admin-claims/update-status.core.ts`**:
  - Ensure RBAC checks and error types are consistent.
- **[ADD] `apps/web/src/actions/admin-users/get-users.test.ts`**:
  - Cross-tenant negative test + pagination validation.
- **[UPDATE TEST] `apps/web/src/actions/admin-settings/update.test.ts`**:
  - Validation and role boundary tests.
- **[UPDATE TEST] `apps/web/src/actions/admin-claims/update-status.test.ts`**:
  - Permission and invalid status tests.
- **[ADD] `security/hardening/admin.md`**:
  - Admin module hardening checklist + evidence.

## 2) Communications (messages + notifications)

- **[MODIFY] `packages/domain-communications/src/messages/send.ts`**:
  - Enforce Zod schema and strict role validation.
- **[MODIFY] `packages/domain-communications/src/messages/mark-read.ts`**:
  - Validate ownership scoping and error types.
- **[MODIFY] `packages/domain-communications/src/notifications/mark-read.ts`**:
  - Enforce user scoping and consistent errors.
- **[MODIFY] `packages/domain-communications/src/messages/schemas.ts`**:
  - Ensure strict input schemas for send/get/mark-read.
- **[MODIFY] `packages/domain-communications/src/notifications/schemas.ts`**:
  - Ensure strict input schemas for mark-read.
- **[MODIFY] `apps/web/src/actions/messages/send.core.ts`**:
  - Rate limit and audit log metadata enforcement.
- **[MODIFY] `apps/web/src/actions/messages/mark-read.core.ts`**:
  - Validate input and enforce tenant/user scoping.
- **[MODIFY] `apps/web/src/actions/notifications/mark-read.core.ts`**:
  - Validate input and enforce tenant/user scoping.
- **[UPDATE TEST] `apps/web/src/actions/messages.send.test.ts`**:
  - Add rate limit + validation tests.
- **[UPDATE TEST] `apps/web/src/actions/messages.mark-read.test.ts`**:
  - Cross-tenant negative tests.
- **[UPDATE TEST] `packages/domain-communications/src/messages/mark-read.test.ts`**:
  - Ownership scoping tests.
- **[UPDATE TEST] `packages/domain-communications/src/notifications/mark-read.test.ts`**:
  - User scoping tests.
- **[ADD] `security/hardening/communications.md`**:
  - Communications module hardening checklist + evidence.

---

# Phase 3: Support & Analytics

## 1) Referrals & Leads

- **[MODIFY] `packages/domain-referrals/src/referrals/get-agent-link.ts`**:
  - Enforce tenant scoping and strict role checks.
- **[MODIFY] `packages/domain-referrals/src/member-referrals/link.ts`**:
  - Verify code generation and role checks remain strict.
- **[MODIFY] `packages/domain-referrals/src/member-referrals/stats.ts`**:
  - Ensure tenant scoping and pagination validation.
- **[MODIFY] `apps/web/src/actions/referrals/get-agent-link.core.ts`**:
  - Add Zod validation and error normalization.
- **[UPDATE TEST] `apps/web/src/actions/referrals/get-agent-link.test.ts`**:
  - Add positive path + cross-tenant negative test.
- **[ADD] `security/hardening/referrals.md`**:
  - Referrals module checklist + evidence.

## 2) Activities

- **[MODIFY] `packages/domain-activities/src/schema.ts`**:
  - Ensure strict schema validation for log/get inputs.
- **[MODIFY] `packages/domain-activities/src/log-lead.ts`**:
  - Enforce RBAC inside domain logic and audit logging.
- **[MODIFY] `packages/domain-activities/src/get-lead.ts`**:
  - Enforce tenant scoping and pagination caps.
- **[MODIFY] `apps/web/src/actions/activities/log-lead.core.ts`**:
  - Add rate limit + input validation.
- **[UPDATE TEST] `packages/domain-activities/src/log-lead.test.ts`**:
  - Add permission denied + validation tests.
- **[ADD] `security/hardening/activities.md`**:
  - Activities module checklist + evidence.

## 3) Analytics

- **[MODIFY] `apps/web/src/actions/analytics/get-admin.core.ts`**:
  - Ensure all queries enforce tenant scoping and input validation.
- **[MODIFY] `apps/web/src/actions/analytics/types.core.ts`**:
  - Add Zod schema for query inputs (date range, limits).
- **[UPDATE TEST] `apps/web/src/actions/analytics/get-admin.test.ts`**:
  - Add tenant scoping and validation tests.
- **[ADD] `security/hardening/analytics.md`**:
  - Analytics module checklist + evidence.

---

## Verification Plan (Phases 1–3)

- **Unit tests**: run target-specific tests listed above per module.
- **Entry-point checks**: `node scripts/check-entrypoints-no-db.mjs`.
- **Typecheck**: `pnpm type-check`.
- **Hardening evidence**: update `security/hardening/*.md` with command outputs.
