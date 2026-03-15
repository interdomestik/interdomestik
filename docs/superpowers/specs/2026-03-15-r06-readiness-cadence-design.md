# R06 Readiness Cadence Design

## Goal

Define a canonical, repo-verifiable pilot readiness cadence that replaces historical `A22` streak inference with current pilot-entry and daily-evidence artifacts.

## Constraints

- Stay inside `P7` pilot-readiness scope only.
- Reuse the existing pilot artifact model from `R01` through `R05`.
- Do not introduce a second evidence log, `tmp/`-backed cadence source, or any routing/auth/tenancy changes.
- Treat `docs/plans/current-program.md` and `docs/plans/current-tracker.md` as the only source of truth.

## Recommended Approach

Add one canonical cadence command, `pnpm pilot:cadence:check`, backed by shared parsing in `scripts/release-gate/pilot-artifacts.ts`.

The cadence should be derived from:

1. the latest canonical pointer row for a `pilotId` in `docs/pilot-evidence/index.csv`
2. the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file referenced by that row
3. the committed `docs/release-gates/...` report path recorded in the daily evidence rows

## Cadence Contract

Readiness cadence is satisfied only when the copied per-pilot evidence index contains `3` consecutive qualifying green operating days for the target `pilotId`.

A day qualifies only when all of these are true:

- `date` is present and valid
- `owner` is present
- `status=green`
- `reportPath` points to `docs/release-gates/...`
- `incidentCount=0`
- `highestSeverity=none`
- `decision=continue`

The command should reject missing or non-canonical pilot-entry artifacts instead of falling back to memory, tracker notes, or `tmp/release-streak/...`.

## Why This Approach

- It reuses the canonical pilot-entry pointer/index layer already established in `R01`.
- It reuses the daily operating artifact established in `R03`.
- It keeps decision discipline from `R04` and tag discipline from `R05` separate instead of overloading those commands.
- It makes `docs/plans/2026-03-05-a22-evidence-reconciliation.md` historical background only, not active governance input.

## Files In Scope

- `scripts/release-gate/pilot-artifacts.ts`
- `scripts/pilot-readiness-cadence.ts`
- `scripts/release-gate/run.test.ts`
- `scripts/package-e2e-scripts.test.mjs`
- `package.json`
- `docs/pilot/PILOT_RUNBOOK.md`
- `docs/pilot/PILOT_GO_NO_GO.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md`
- `docs/pilot-entry-criteria.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`

## Verification

- focused release-gate tests for pass/fail cadence evaluation
- package-script coverage for the new command and docs contract
- `pnpm test:release-gate`
- `node --test scripts/package-e2e-scripts.test.mjs`
- `pnpm plan:status`
- `pnpm plan:proof`
- a temp-dir dry run proving 3 qualifying green days pass and non-qualifying rows fail
