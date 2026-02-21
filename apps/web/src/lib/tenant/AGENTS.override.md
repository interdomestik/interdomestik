# AGENTS.override — tenant boundaries (high-risk)

## Purpose

Prevent tenant-isolation regressions by making every tenant-related edit auditable and tightly scoped to approved slices.

## Allowed changes

- Tenant behavior updates only when the slice explicitly lists scope, risk, and migration dependency plan.
- Non-breaking additions with explicit tests for boundary behavior.
- Keep routing and auth untouched unless called out by scope.

## Forbidden changes

- No tenant isolation logic changes without Atlas + Sentinel approval.
- No proxy/routing/auth precedence edits in this path.
- No widening of tenant visibility (member/agent lists, claim filters, session joins).
- Do not change `tenantId` trust sources without explicit exception.

## Required tests

- Unit/integration tests for tenant-scoped query behavior.
- Explicit cross-tenant access tests covering denied and error paths.
- Evidence entry with branch coverage and failure signatures.

## Hard-stop signatures

- Missing tenantId in protected reads/writes.
- Cross-tenant read/write attempts.
- Any 5xx or authorization bypass traces in tenant resolution.
- RLS or row-level filtering inconsistencies.

## Escalation rule

- Stop any tenant-boundary modification that can affect data visibility or scope resolution and escalate immediately to Atlas and Sentinel.
