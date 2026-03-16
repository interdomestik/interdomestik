# PD03 — Closed-Loop Role Flow

Use this scenario sheet for Day 3 of the `P8P` seven-day pilot rehearsal.

## Purpose

Validate the repo’s real pilot role chain end to end:

- member
- agent
- staff
- branch_manager
- admin

## Scenario Summary

- Scenario ID: `PD03`
- Day: `3`
- Name: `Closed-Loop Role Flow`
- Expected color: `green` or bounded `amber`
- Expected decision: `continue`

## Preconditions

- `PD01` and `PD02` are complete
- reset gate is green
- seeded pilot data is ready for the closed-loop walkthrough

## Command Order

1. prepare seeded role-flow state
2. execute the member -> agent -> staff -> branch_manager -> admin walkthrough
3. fill the Day 3 daily sheet
4. record day-3 evidence row
5. record day-3 observability row
6. record day-3 decision row

## Pass Rules

`PD03` is `green` if:

- each role can complete its intended step
- branch_manager oversight is visible and branch-scoped
- admin final review remains intact
- no boundary leak occurs

## Amber Rules

`PD03` is `amber` if:

- the loop completes
- but there is operator friction, incomplete context, or handoff weakness that does not create a trust or safety breach

## Red Rules

`PD03` is `red` if:

- any role cannot complete the required closed-loop step
- branch or tenant boundaries fail
- admin decision custody breaks

## Blocked Rules

`PD03` is `blocked` if:

- the seeded state is incomplete
- the evidence trail cannot be written canonically

## Required Artifacts

- Day 3 daily sheet
- `day-3` evidence row
- `day-3` observability row
- `day-3` decision row
- any supporting role-flow evidence paths

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

- `P1T`
- `P4`
- `P6`
- `P7`
