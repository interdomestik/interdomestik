# Memory Retrieval (Advisory)

- version: `1.0.0`
- effective_date: `2026-03-04`
- scope: `A2.1`

## Purpose

Provide deterministic, advisory-only retrieval of memory lessons before implementation actions. Retrieval does not block execution in Sprint 1-2.

## Command

```bash
pnpm memory:retrieve -- --query <query.json> [--limit <n>]
```

## Input Signals

- `trigger_signature`
- `risk_class`
- `scope.file_path`
- `scope.route`
- `scope.table`
- `scope.tenant`

At least one signal is required.

## Deterministic Ordering

- Score by matched key weights.
- Tie-breakers:

1. `status` priority (`canonical` > `validated` > `candidate` > `obsolete`)
2. `id` lexical order

## Advisory Default

- Default included statuses: `candidate`, `validated`, `canonical`.
- `obsolete` is excluded unless explicitly requested.
