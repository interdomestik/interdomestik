# Memory Registry

- version: `1.0.0`
- effective_date: `2026-03-03`
- storage_file: `docs/plans/2026-03-03-memory-registry.jsonl`

## Purpose

Append-only registry for A1 advisory memory records using lifecycle states:

- `candidate`
- `validated`
- `canonical`
- `obsolete`

## Validation

Run:

```bash
pnpm memory:validate
```

Optional report output:

```bash
pnpm memory:validate -- --report tmp/plan-conformance/memory-validate-report.json
```

## Deterministic ID Rule

- `id` must be deterministic and computed from the memory seed payload:
  - `store_type`
  - `trigger_signature`
  - `risk_class`
  - `scope`
  - `lesson`
- Current algorithm: `mem_<sha256(seed_payload_json)[:16]>`

## Deterministic Index Rule

Generate retrieval index:

```bash
pnpm memory:index
```

Default index output: `docs/plans/2026-03-03-memory-index.json`
Index keys:

- `trigger_signature`
- `file_path`
- `route`
- `table`
- `tenant`
- `risk_class`
