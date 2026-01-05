# Module Hardening Checklist Template

Use this template to harden one module at a time. Copy it into a new file
per module (for example: security/hardening/claims.md).

## Module Metadata

- Module name:
- Owner:
- Risk level: low | medium | high
- Status: not_started | in_progress | blocked | done
- Date started:
- Date completed:

## Scope

- Packages / apps:
- Entry points (routes, actions, server components):
- Data tables / storage buckets:
- External dependencies (webhooks, APIs):

## Hardened Module Standard (Definition of Done)

### Strict Input Validation

- [ ] All API routes and server actions parse input with Zod.
- [ ] No `any` in request/response boundaries (use `unknown` + Zod).
- [ ] File uploads validate type, size, and filename.

### Deep Authorization (RBAC)

- [ ] Role checks exist inside domain logic, not only middleware/pages.
- [ ] Permission failures return 403 with consistent error type.
- [ ] Tests cover a "permission denied" path.

### Data Isolation (Tenant/User Scoping)

- [ ] All queries include tenant/user filters or verified RLS.
- [ ] Cross-tenant access returns 403/404.
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
- [ ] E2E: at least one end-to-end flow for the module.
- [ ] Evidence recorded (test command output or report path).

## Audit Notes

- Findings:
- Missing items:
- Security risks:

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
