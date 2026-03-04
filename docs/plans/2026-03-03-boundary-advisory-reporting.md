# Boundary Diff Advisory Reporting

- version: `1.0.0`
- effective_date: `2026-03-04`
- scope: `B1.2`

## Purpose

Classify changed files against boundary taxonomy and emit advisory risk signals before any enforcement mode.

## Command

```bash
pnpm boundary:diff:report -- --changed-list <changed-files.json>
```

## Output Signals

- `no_go` (true when no-touch zones are touched)
- `recommended_decision` (`continue|pause|rollback`)
- per-file classification:
  - `no_touch`
  - `protected_boundary`
  - `advisory_watch`
  - `unclassified`

## Mode

- Advisory-only for Sprint 1-2.
- Supports reviewer decisions and conformance evidence.
