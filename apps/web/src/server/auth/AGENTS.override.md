# AGENTS.override — server auth entry points (high-risk)

## Purpose

Keep server-auth entry points immutable unless explicitly required and reviewed for tenant/session security.

## Allowed changes

- Server-auth edits only with explicit Atlas approval and Sentinel sign-off.
- Changes must include targeted tests and rollback-safe proof artifacts.
- Keep edits narrowly scoped to the affected code path.

## Forbidden changes

- No auth/session bypasses or privilege escalations.
- No tenant-scoping loosening for server entry points.
- No removal of validation, RBAC checks, or error boundaries.

## Required tests

- Tests for auth, RBAC, and tenant scoping in changed paths.
- Regression tests for denied-path and failure handling.
- Evidence with checks and status outputs.

## Hard-stop signatures

- Session validation failure.
- Tenant scoping ambiguity or mismatch.
- auth/session anomaly patterns in logs.
- request validation failures that should short-circuit.

## Escalation rule

- If server-auth behavior can impact any role/path boundary, pause and escalate to Atlas + Sentinel immediately.
