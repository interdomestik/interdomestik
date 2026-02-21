# AGENTS.override — database and tenant domain data (high-risk)

## Purpose

Protect tenant-scoped persistence and enforcement logic from unreviewed boundary changes across schema, queries, and repository layers.

## Allowed changes

- DB tenant-boundary edits only with explicit Atlas slice and Sentinel security review.
- Keep schema/query changes minimal and include migration/runbook notes when needed.
- Add/adjust tests for any change in constraints, indexes, scopes, or tenant filters.

## Forbidden changes

- No direct tenant boundary changes without approval.
- No RLS/constraint bypasses, or broadening data exposure queries.
- No destructive schema mutations without approved migration strategy.
- No direct credential/environment mutation in package scripts or migrations.

## Required tests

- Unit/DB tests for tenant-scoped reads/writes and constraints.
- Regression tests for cross-tenant isolation.
- Evidence with migration notes and rollback plan.

## Hard-stop signatures

- Cross-tenant row leak or mismatch.
- Missing tenant predicate where required.
- failed tenant constraints, RLS violations, migration failures.

## Escalation rule

- Any DB change touching tenant or access-scoped behavior must be reported immediately to Atlas and Sentinel before continuing.
