# PD07 — Executive Review

Use this scenario sheet for Day 7 of the `P8P` seven-day pilot rehearsal.

## Purpose

Produce the final evidence-backed recommendation for the redesigned rehearsal without changing the canonical daily decision schema.

## Scenario Summary

- Scenario ID: `PD07`
- Day: `7`
- Name: `Executive Review`
- Expected color: `green` or bounded `amber`
- Expected decision: `continue` or `pause`
- Final recommendation set:
  - `expand`
  - `repeat_with_fixes`
  - `pause`
  - `stop`

## Preconditions

- `PD01` through `PD06` are complete
- the copied evidence index contains all daily rows to date
- branch and admin recommendations are available where relevant

## Command Order

1. review cumulative daily evidence
2. review cumulative observability and incident pattern
3. review branch-manager and admin decision trail
4. fill the Day 7 daily sheet
5. record day-7 evidence row
6. record day-7 observability row
7. record canonical day-7 decision row
8. create the canonical executive review artifact from the template
9. record the executive recommendation in the daily sheet summary and link the canonical review artifact

## Pass Rules

`PD07` passes if:

- cumulative evidence is complete
- executive review can produce a defensible recommendation
- canonical day-7 decision proof remains within the stable command vocabulary

## Amber Rules

`PD07` is `amber` if:

- evidence is complete
- but the final recommendation is `repeat_with_fixes` or `pause`

## Red Rules

`PD07` is `red` if:

- evidence custody is incomplete
- stop criteria are met
- executive review cannot be defended from the repo-backed trail

## Blocked Rules

`PD07` is `blocked` if:

- required daily evidence is missing
- the final recommendation cannot be tied back to the copied evidence index

## Required Artifacts

- Day 7 daily sheet
- `day-7` evidence row
- `day-7` observability row
- `day-7` decision row
- canonical executive review artifact:
  - `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md`

## Orchestration Traceability

Record:

- lead orchestrator
- worker lanes used
- each lane scope
- what stayed centralized
- who merged evidence
- who made the final daily judgment

This day may legitimately be a `single-orchestrator run` if the executive review is primarily synthesis rather than parallel evidence gathering.

## Coverage Mapping

Mapped coverage:

- `P6`
- `P7`
- `P8R`
- `P8P`
