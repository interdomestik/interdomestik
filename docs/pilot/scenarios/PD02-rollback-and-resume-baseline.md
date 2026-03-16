# PD02 — Rollback And Resume Baseline

Use this scenario sheet for Day 2 of the `P8P` seven-day pilot rehearsal.

## Purpose

Prove that rollback tag discipline, resume requirements, and decision-proof linkage work cleanly after `PD01`.

## Scenario Summary

- Scenario ID: `PD02`
- Day: `2`
- Name: `Rollback And Resume Baseline`
- Expected color: `green`
- Expected decision: `continue`

## Preconditions

- `PD01` is complete
- reset gate is green
- a new pilot id exists for the `P8P` run
- release report and copied evidence index already exist for the new pilot id

## Command Order

1. verify the current report and copied evidence index paths
2. `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`
3. `pnpm pilot:check`
4. if resume validation requires it, `pnpm release:gate:prod -- --pilotId <pilot-id>`
5. record day-2 evidence row
6. record day-2 observability row
7. record day-2 decision row with rollback target or `n/a` as appropriate

## Pass Rules

`PD02` is `green` only if:

- rollback tag discipline is inspectable and valid
- `pnpm pilot:check` passes cleanly
- decision proof can reference the matching observability row without manual repair
- no artifact-custody ambiguity remains

## Amber Rules

`PD02` is `amber` if:

- rollback and resume proof works
- but a non-blocking operator follow-up remains

## Red Rules

`PD02` is `red` if:

- rollback target cannot be trusted
- `pnpm pilot:check` fails through a reset-gate path
- observability-to-decision proof is broken again

## Blocked Rules

`PD02` is `blocked` if:

- the copied evidence index cannot be trusted
- the release report path cannot be confirmed
- the rollback target cannot be mapped to the canonical pilot state

## Required Artifacts

- canonical release report path
- copied evidence index path
- `day-2` observability row
- `day-2` decision row
- rollback target reference
- Day 2 daily sheet

## Orchestration Traceability

Record:

- lead orchestrator
- worker lanes used
- each lane scope
- what stayed centralized
- who merged evidence
- who made the final daily judgment

Suggested lanes:

- release or artifact lane
- observability lane

## Coverage Mapping

`PD02` validates:

- rollback discipline and resume proof
- deterministic decision custody after `P7`

Mapped coverage:

- `P2`
- `P6`
- `P7`
- `P8R/RG01-RG05`
