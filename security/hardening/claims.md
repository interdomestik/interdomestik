# Claims Management Hardening

## Module Metadata

- Module name: Claims Management
- Owner: TBD
- Risk level: high
- Status: in_progress
- Date started: 2026-01-05
- Date completed:

## Scope

- Packages / apps: `packages/domain-claims`, `apps/web/src/actions/claims`, `apps/web/src/actions/agent-claims`, `apps/web/src/actions/staff-claims`, `apps/web/src/actions/admin-claims`, `apps/web/src/app/api/claims`, `apps/web/src/app/api/uploads`
- Entry points (routes, actions, server components): server actions under `apps/web/src/actions/**`, `/api/claims`, `/api/uploads`
- Data tables / storage buckets: `claims`, `claim_documents`, `claim_messages`, `claim_stage_history`, `audit_log`, storage bucket `claim-evidence`
- External dependencies (webhooks, APIs): Supabase Storage, membership checks (`domain-membership-billing`), notifications (`notifyClaimSubmitted`, `notifyStatusChanged`, `notifyClaimAssigned`)

## Hardened Module Standard (Definition of Done)

### Strict Input Validation

- [ ] All API routes and server actions parse input with Zod.
- [x] No `any` in request/response boundaries (use `unknown` + Zod).
- [x] File uploads validate type, size, and filename.

### Deep Authorization (RBAC)

- [ ] Role checks exist inside domain logic, not only middleware/pages.
- [ ] Permission failures return 403 with consistent error type.
- [ ] Tests cover a "permission denied" path.

### Data Isolation (Tenant/User Scoping)

- [x] All queries include tenant/user filters or verified RLS.
- [x] Cross-tenant access returns 403/404.
- [ ] Tests include cross-tenant access attempt.

### Rate Limiting

- [ ] High-risk writes are rate limited (create/update/delete).
- [ ] Limits are documented with name + window + threshold.
- [ ] Tests cover 429/503 rate-limit response.

### State Integrity & Idempotency

- [ ] External side effects are idempotent or guarded (dedupe key/version check).
- [ ] Concurrent updates have a defined rule (optimistic lock or last-write wins).
- [ ] Tests cover duplicate submissions where applicable.

### Audit Logging

- [ ] All mutations emit audit/activity logs.
- [ ] Logs exclude PII and include correlation IDs.
- [ ] Tests assert audit log is written for at least one mutation.

### Test Coverage

- [ ] Unit: happy path + critical error path for each core mutation.
- [x] E2E: at least one end-to-end flow for the module.
- [ ] Evidence recorded (test command output or report path).

## Audit Notes

- Findings:
  - Claims submit/create/draft use Zod, but admin/staff/agent claim status + assignment paths use raw FormData/strings (no Zod schema).
  - Staff claim status update does not verify the staff member is assigned to the claim.
  - Staff assignment and status updates do not emit audit logs; other claim mutations do.
  - `logAuditEvent` requires a tenantId; claim actions do not pass tenantId so audit writes may be skipped.
  - No rate limit on submit/cancel/update-status/assign actions.
  - Upload API allows only images/PDF, but claim submission allows audio MIME types (mismatch).
- Missing items:
  - Zod schemas for status change, assignment, and admin form data.
  - Consistent error typing (403 vs thrown Error) for RBAC failures.
  - Cross-tenant negative tests for actions/claims and uploads.
  - Idempotency or duplicate-submit guard for claim submission.
  - Audit log assertions in tests (and tenantId propagation).
- Security risks:
  - Unauthorized staff could update any claim status if not assigned.
  - Missing audit log writes reduce traceability of claim mutations.
  - Lack of rate limiting on submit/update could allow abuse.

## Fix Log

- [ ] Fix 1:
- [ ] Fix 2:
- [ ] Fix 3:

## Evidence

- Unit tests:
- E2E tests:
- Logs/screenshots:

## Sign-Off

- [ ] Owner reviewed
- [ ] Security review complete
- [ ] Ready for next module
