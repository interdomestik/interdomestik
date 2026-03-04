# Advisory Retrieval Telemetry

- version: `1.0.0`
- effective_date: `2026-03-04`
- scope: `A2.2`

## Purpose

Emit advisory retrieval evidence as structured telemetry without adding any PR-blocking behavior.

## Command

```bash
pnpm memory:advisory:report -- --retrieval tmp/plan-conformance/advisory-retrieval-report.json --context <optional-context.json>
```

## Output Contract

`AdvisorySignalReportV1`

- `run_id`
- `retrieval_hits[]`
- `noise_flags[]`
- `boundary_findings[]`
- `usefulness_score`

## Mode

- Advisory only in Sprint 1-2.
- Reports support threshold reviews and promotion decisions.
