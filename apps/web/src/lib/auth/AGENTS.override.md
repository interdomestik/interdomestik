# AGENTS.override — auth boundary (high-risk)

## Purpose

Protect auth/session orchestration from unreviewed drift and prevent RBAC/tenant isolation regressions in auth-adjacent agent changes.

## Allowed changes

- Auth behavior edits only inside explicitly approved slices.
- Changes that are contract-only (documentation/tests for existing auth flow) with no behavioral change.
- Add tests for every auth or role-path branch that is changed.

## Forbidden changes

- No auth/session orchestration edits without Sentinel approval and Atlas routing plan.
- No tenant/session boundary changes that alter trust assumptions.
- No bypassing, skipping, or weakening of auth, RBAC, or role enforcement.
- No edits that touch `apps/web/src/proxy.ts` behavior.

## Required tests

- Auth/session happy path and failure-path tests.
- Role-based access tests for affected routes/components.
- Evidence package with failures/successes for guardrail checks.

## Hard-stop signatures

- Missing/invalid session claims.
- Unexpected role resolution / privilege mismatch.
- Cross-tenant session reuse indicators.
- digest/session integrity validation failures.

## Escalation rule

- If trust assumptions can change, stop immediately and escalate to Atlas and Sentinel for review before proceeding.
