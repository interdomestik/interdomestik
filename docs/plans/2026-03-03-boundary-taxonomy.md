# Boundary Protection Taxonomy (Advisory)

- version: `1.0.0`
- effective_date: `2026-03-04`
- scope: `B1.1`

## Source of Truth Artifacts

- `scripts/plan-conformance/boundary-taxonomy.json`
- `scripts/release-gate/v1-required-specs.json`

## Required Classes

- `no_touch_patterns`
- `protected_patterns`
- `advisory_watch_patterns`

## Contract Anchors

- Canonical routes: `/member`, `/agent`, `/staff`, `/admin`
- Clarity markers include: `page-ready`, `staff-page-ready`, `admin-page-ready`
- No-touch list must match release-gate manifest exactly

## Validation Command

```bash
pnpm boundary:taxonomy:validate
```
