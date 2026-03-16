# PD06 — Communications And Incident Drill

Use this scenario sheet for Day 6 of the `P8P` seven-day pilot rehearsal.

## Purpose

Validate pilot-critical communications, observability review, and the bounded incident or hotfix path under controlled conditions.

## Scenario Summary

- Scenario ID: `PD06`
- Day: `6`
- Name: `Communications And Incident Drill`
- Expected color: `green` or bounded `amber`
- Expected decision: evidence-backed `continue` or bounded `hotfix`

## Preconditions

- `PD01` through `PD05` are complete
- communication-critical channels in scope are identified
- a controlled incident drill is prepared

## Command Order

1. execute the scoped communication checks
2. execute the observability review
3. run the controlled incident or hotfix drill
4. fill the Day 6 daily sheet
5. record day-6 evidence row
6. record day-6 observability row
7. record day-6 decision row

## Pass Rules

`PD06` passes if:

- in-scope communication paths are reliable enough for the pilot promise
- observability review is complete
- incident handling produces an evidence-backed outcome

## Amber Rules

`PD06` is `amber` if:

- a communication fallback or bounded hotfix is required
- but the day remains governable and safely recoverable

## Red Rules

`PD06` is `red` if:

- communication-critical paths fail without safe fallback
- incident handling loses decision custody
- stop criteria are triggered without a trustworthy rollback path

## Blocked Rules

`PD06` is `blocked` if:

- required channels in scope were never identified
- the incident drill cannot produce canonical evidence

## Required Artifacts

- Day 6 daily sheet
- `day-6` evidence row
- `day-6` observability row
- `day-6` decision row
- any comms or incident evidence references

## Orchestration Traceability

Record:

- lead orchestrator
- worker lanes used
- each lane scope
- what stayed centralized
- who merged evidence
- who made the final daily judgment

Suggested lanes:

- communications lane
- observability lane
- security or boundary lane when incident scope touches boundaries

## Coverage Mapping

Mapped coverage:

- `P1C`
- `P4`
- `P6`
- `P7`
