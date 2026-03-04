# Memory Promotion Governance (Advisory)

- version: `1.0.0`
- effective_date: `2026-03-04`
- scope: `A2.3`

## Status Lifecycle

- `candidate`
- `validated`
- `canonical`
- `obsolete`

## Transition Rules

- `candidate -> validated | obsolete`
- `validated -> canonical | obsolete`
- `canonical -> obsolete`

## Promotion Rule Enforcement

### `auto_policy`

- `validated -> canonical` requires:

1. `approval_type=auto_policy`
2. `auto_policy_pass=true`

### `owner_approval`

- `validated -> canonical` requires:

1. `approval_type=owner|hitl`
2. `approved_by` set

### `hitl_required`

- `validated -> canonical` requires:

1. `approval_type=hitl`
2. `approved_by` set

## Command

```bash
pnpm memory:promote -- --memory-id <id> --to-status canonical --approval-type hitl --approved-by security.owner
```

## Sprint 1-2 Safety Mode

- Promotion decisions are governance artifacts in advisory mode.
- No new PR-blocking behavior is introduced by this workflow.
