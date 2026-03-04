# Boundary Contract Check

- version: `1.0.0`
- effective_date: `2026-03-04`
- scope: `B1.3`

## Purpose

Evaluate boundary diff reports against no-touch and protected-boundary rules and emit a deterministic decision hint.

## Command

```bash
pnpm boundary:contract:check -- --report tmp/plan-conformance/boundary-diff-report.json --mode advisory
```

## Behavior

- `no_touch_touched > 0` -> `contract_status=fail`, `decision_hint=rollback`
- `protected_touched > 0` (without no-touch) -> `contract_status=warn`, `decision_hint=pause`
- otherwise -> `contract_status=pass`, `decision_hint=continue`

## Mode Rules

- `advisory`: never forces non-zero exit; emits guidance only.
- `enforced`: non-zero exit only on `contract_status=fail`.
