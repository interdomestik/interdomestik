# Interdomestik v1.0.0 Pilot Execution Checklist

Pilot ID: `pilot-ks-v1-0-0-2026-03-28`

## Pre-Entry

- [ ] Confirm `main` is the authority branch
- [ ] Confirm current release-candidate fixes are merged to `main`
- [ ] Run `pnpm pilot:check`
- [ ] Confirm local result is green before running production proof

## Pilot Entry

- [ ] Run `pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28`
- [ ] Confirm a new `docs/release-gates/YYYY-MM-DD_production_<deployment>.md` report exists
- [ ] Confirm `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-2026-03-28.md` exists
- [ ] Confirm `docs/pilot-evidence/index.csv` contains the new pilot-entry pointer row

## Scope Guard

- [ ] Keep branch scope at `KS`
- [ ] Keep one bounded branch authority line
- [ ] Keep the initial operator set narrow
- [ ] Do not attach expansion language to the pilot-entry package

## Day-1 Operating Record

- [ ] Record day-1 evidence with `pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 ...`
- [ ] Record day-1 observability with `pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 ...`
- [ ] Record day-1 decision with `pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 ...`

## Clean-Operation Objective

- [ ] Confirm canonical evidence is usable from day 1
- [ ] Confirm no post-hoc repair is required to make KPI or decision evidence defensible
- [ ] Stop and classify if evidence custody becomes ambiguous

## Progression Focus

- [ ] Review claims that stall after triage
- [ ] Quantify `2 Operating-Day Progression Rate`
- [ ] Carry progression into the executive closeout, not just triage/update SLA

## Privacy / RBAC Re-Proof

- [ ] Re-run Day-5-style privacy and RBAC checks on the corrected baseline
- [ ] Record the outcome in observability notes
- [ ] Escalate immediately on any tenant, branch, or aggregate-only leak

## Decision Gate

- [ ] Produce a fresh executive review for `pilot-ks-v1-0-0-2026-03-28`
- [ ] Keep default post-window decision at `pause` unless a stronger recommendation is written explicitly
- [ ] Do not continue or expand by inference
