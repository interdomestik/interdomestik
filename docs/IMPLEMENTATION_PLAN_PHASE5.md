# Implementation Plan - Phase 5: Claims & Uploads Completion (Modularization Hardening)

This phase closes the remaining hardening gaps in Claims and Uploads while enforcing modularization guardrails (entrypoints thin, business logic in domain/core modules).

## Modularization Guardrails

- **[REFERENCE] `MODULARIZATION_REPORT.md`**: keep entrypoints thin; move logic into `*_core.ts` or domain packages.
- **[VERIFY] `scripts/check-entrypoints-no-db.mjs`** after changes.
- **[UPDATE] `MODULARIZATION_REPORT.md`** if any new core modules are introduced.

## Scope

- Claims lifecycle (member, staff, agent, admin)
- Claim evidence uploads and voice notes
- Audit logging, rate limiting, idempotency

## Proposed Changes

### [domain-claims]

- **[MODIFY] `packages/domain-claims/src/validators/claims.ts`**:
  - Add Zod schemas for status transitions and assignment inputs.
- **[MODIFY] `packages/domain-claims/src/claims/status.ts`**:
  - Normalize error results and validate status transitions with schema.
- **[MODIFY] `packages/domain-claims/src/agent-claims/assign.ts`**:
  - Validate inputs with Zod and enforce staff-only assignment rules.
- **[MODIFY] `packages/domain-claims/src/agent-claims/update-status.ts`**:
  - Enforce status transitions and verify staff assignment before update.
- **[MODIFY] `packages/domain-claims/src/staff-claims/assign.ts`**:
  - Add audit log emission and return consistent error shape.
- **[MODIFY] `packages/domain-claims/src/staff-claims/update-status.ts`**:
  - Enforce staff assignment scoping + error normalization.
- **[MODIFY] `packages/domain-claims/src/admin-claims/update-status.ts`**:
  - Normalize status transitions + error shape + audit metadata.

### [actions/claims + staff/agent/admin]

- **[MODIFY] `apps/web/src/actions/claims/submit.core.ts`**:
  - Add idempotency guard (reject duplicate submissions for same claim).
- **[MODIFY] `apps/web/src/actions/claims/status.core.ts`**:
  - Add rate limiting and map errors to action result.
- **[MODIFY] `apps/web/src/actions/agent-claims/assign.core.ts`**:
  - Add Zod parsing + rate limiting before domain call.
- **[MODIFY] `apps/web/src/actions/agent-claims/update-status.core.ts`**:
  - Add Zod parsing + rate limiting before domain call.
- **[MODIFY] `apps/web/src/actions/staff-claims/assign.core.ts`**:
  - Add Zod parsing + rate limiting before domain call.
- **[MODIFY] `apps/web/src/actions/staff-claims/update-status.core.ts`**:
  - Add Zod parsing + rate limiting before domain call.
- **[MODIFY] `apps/web/src/actions/admin-claims/update-status.core.ts`**:
  - Replace raw FormData parsing with Zod validation.

### [uploads]

- **[MODIFY] `apps/web/src/app/api/uploads/_core.ts`**:
  - Align allowed MIME list with voice note upload policy (explicit audio vs evidence policy).
- **[MODIFY] `apps/web/src/actions/uploads/upload.ts`**:
  - Ensure allowed MIME list matches upload policy and is documented.

### [audit logging]

- **[MODIFY] `apps/web/src/lib/audit.ts`**:
  - Ensure tenantId is always included in audit metadata (or fail if missing).
- **[MODIFY] `packages/domain-claims/src/claims/types.ts`**:
  - Add audit context to deps typings if needed.

### [security docs]

- **[UPDATE] `security/hardening/claims.md`**:
  - Mark completed checklist items + add evidence paths.

## Tests & Verification

### Unit Tests

- **[UPDATE] `packages/domain-claims/src/claims/status.test.ts`**:
  - Invalid status + unauthorized + cross-tenant tests.
- **[UPDATE] `packages/domain-claims/src/agent-claims/assign.test.ts`**:
  - Tenant scoping + staff assignment rules.
- **[ADD] `apps/web/src/actions/claims/submit.test.ts`**:
  - Idempotency + rate limit coverage.
- **[UPDATE] `apps/web/src/actions/agent-claims.update-status.test.ts`**:
  - Permission denied and invalid transition tests.
- **[UPDATE] `apps/web/src/actions/staff-claims.update-status.test.ts`**:
  - Assignment enforcement + rate limit tests.
- **[UPDATE] `apps/web/src/actions/admin-claims.update-status.test.ts`**:
  - Zod validation errors + unauthorized test.

### E2E

- **[VERIFY] `apps/web/e2e/claim-submission.spec.ts`**:
  - Happy path for claim submission.
- **[ADD] `apps/web/e2e/claim-routing.spec.ts`**:
  - Cross-role permissions (member vs staff vs admin).

### Commands

- `pnpm --filter @interdomestik/domain-claims test:unit`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/claims/submit.test.ts`
- `pnpm --filter @interdomestik/web test:e2e -- --grep "claim"`
- `node scripts/check-entrypoints-no-db.mjs`
- `pnpm type-check`

## Definition of Done

- All claim mutations have Zod validation, rate limits, tenant scoping, and audit logging.
- Upload policy is consistent for evidence and voice notes.
- Tests cover permission denied and cross-tenant access for claims.
- `security/hardening/claims.md` updated with evidence.
