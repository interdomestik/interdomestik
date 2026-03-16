# PD04 — SLA / Matter / Branch Pressure

Use this scenario sheet for Day 4 of the `P8P` seven-day pilot rehearsal.

## Purpose

Validate incomplete-vs-running SLA behavior, matter accounting, branch queue pressure, and branch_manager recommendation handling.

## Scenario Summary

- Scenario ID: `PD04`
- Day: `4`
- Name: `SLA / Matter / Branch Pressure`
- Expected color: bounded `amber`, not `red`
- Expected decision: `continue` or bounded `pause`

## Preconditions

- `PD01` through `PD03` are complete
- seeded branch-pressure scenario exists
- branch_manager review path is available

## Command Order

1. load the seeded branch-pressure state
2. inspect incomplete vs running SLA behavior
3. inspect matter count behavior
4. capture branch_manager recommendation
5. fill the Day 4 daily sheet
6. record day-4 evidence row
7. record day-4 observability row
8. record day-4 decision row

## Pass Rules

`PD04` passes if:

- incomplete vs running SLA remains correct
- matter counts remain coherent
- branch queue pressure is visible
- branch_manager recommendation is captured

## Amber Rules

`PD04` is expected to allow bounded `amber` if:

- queue pressure exists
- branch-level reprioritization is needed
- but no trust, privacy, or contract breach occurs

## Red Rules

`PD04` is `red` if:

- SLA logic is materially wrong
- matter accounting fails
- branch-local risk cannot be escalated safely

## Blocked Rules

`PD04` is `blocked` if:

- the scenario cannot distinguish incomplete vs running SLA
- branch review notes are missing

## Required Artifacts

- Day 4 daily sheet
- `day-4` evidence row
- `day-4` observability row
- `day-4` decision row
- any branch queue or backlog evidence path

## Orchestration Traceability

Record:

- lead orchestrator
- worker lanes used
- each lane scope
- what stayed centralized
- who merged evidence
- who made the final daily judgment

Suggested lanes:

- branch-ops lane
- observability lane

## Coverage Mapping

Mapped coverage:

- `P1C`
- `P3`
- `P4`
- `P6`
- `P7`
