# AGENTS.override — API route boundary (high-risk)

## Purpose

Keep API route changes constrained to explicit, reviewed pilot slices so tenant/auth boundaries are never widened accidentally by automation.

## Allowed changes

- API contract updates only when the slice explicitly requests API behavior changes.
- Explicitly defined acceptance criteria, security review scope, and test evidence are required.
- Keep edits limited to the smallest affected route, helper, or test fixture.

## Forbidden changes

- No direct editing of auth routing or tenant isolation unless this file path is part of an approved slice.
- No proxy behavior changes.
- No implicit trust-model changes for request metadata (`tenantId`, impersonation, role escalation).
- No secret/env manipulation or credential-handling behavior changes.

## Required tests

- Unit/integration tests for changed API contracts.
- Security regression checks for authorization/validation paths.
- Evidence artifact with command output and pass/fail status.

## Hard-stop signatures

- Missing tenantId or session for protected actions.
- Cross-tenant data read/write attempts.
- 5xx, auth/session anomalies, or token validation failures during route execution.

## Escalation rule

- Stop and report to Atlas + Sentinel immediately if any acceptance criteria, security behavior, or tenant boundary expectation is changed.
