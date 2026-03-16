# PD01 — Release Gate Green Baseline

Use this scenario sheet for Day 1 of the `P8P` seven-day pilot rehearsal.

This is the canonical execution guide for the redesigned `PD01` scenario. It supersedes the earlier 14-day scenario framing without rewriting completed `P7` history.

## Purpose

Prove that the pilot-entry machinery is green and that the required repo-backed artifacts are produced correctly before any broader operational scenarios begin.

`PD01` is not a feature test. It is the baseline release-and-evidence custody test for the new seven-day pilot operating system.

## Scenario Summary

- Scenario ID: `PD01`
- Day: `1`
- Name: `Release Gate Green Baseline`
- Mode: `rehearsal` or `live`
- Expected color: `green`
- Expected decision: `continue`
- Primary owner: platform or pilot operator
- Branch manager review: optional unless branch-local issues appear
- Admin review: required

## Preconditions

Complete these before running the scenario:

- reset gate is green
- `pnpm pilot:check` is expected to pass
- pilot id is chosen and stable for the full pilot window
- required envs are present
- the repo is on the intended pilot branch or commit
- the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file does not yet exist, or if it exists, you intend to reuse it for the same pilot id

## Inputs

- [PILOT_RUNBOOK.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/PILOT_RUNBOOK.md)
- [pilot-entry-criteria.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot-entry-criteria.md)
- [PILOT_DAILY_SHEET_TEMPLATE.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/PILOT_DAILY_SHEET_TEMPLATE.md)
- [PILOT_EVIDENCE_INDEX_TEMPLATE.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md)
- [PILOT_GO_NO_GO.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/pilot/PILOT_GO_NO_GO.md)
- [2026-03-16-p8-pilot-redesign-blueprint-v1.md](/Users/arbenlila/development/interdomestik-crystal-home/docs/plans/2026-03-16-p8-pilot-redesign-blueprint-v1.md)

## Required Outputs

`PD01` should produce:

1. a production release report in `docs/release-gates/`
2. a copied pilot evidence index file in `docs/pilot/`
3. a canonical pointer row in `docs/pilot-evidence/index.csv`
4. one completed daily sheet for Day 1
5. one observability row for `day-1`
6. one decision row for `day-1`

## Execution Order

Run the scenario in this order:

1. `pnpm pilot:check`
2. `pnpm release:gate:prod -- --pilotId <pilot-id>`
3. fill the Day 1 daily sheet from `PILOT_DAILY_SHEET_TEMPLATE.md`
4. `pnpm pilot:evidence:record -- --pilotId <pilot-id> --day 1 ...`
5. `pnpm pilot:observability:record -- --pilotId <pilot-id> --reference day-1 ...`
6. `pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType daily --reference day-1 ...`

## Suggested Command Skeleton

Replace placeholders before running:

```bash
pnpm pilot:check
pnpm release:gate:prod -- --pilotId <pilot-id>
pnpm pilot:evidence:record -- --pilotId <pilot-id> --day 1 --date <YYYY-MM-DD> --owner "<owner>" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath <path-or-n/a>
pnpm pilot:observability:record -- --pilotId <pilot-id> --reference day-1 --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise> --functionalErrorCount 0 --expectedAuthDenyCount <n> --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes <n/a-or-path>
pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType daily --reference day-1 --date <YYYY-MM-DD> --owner "<owner>" --decision continue --observabilityRef day-1
```

## Pass Conditions

`PD01` is `green` only if all of these are true:

- `pnpm pilot:check` exits `0`
- `pnpm release:gate:prod -- --pilotId <pilot-id>` exits `0`
- release report exists in `docs/release-gates/`
- copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` exists
- pointer row exists in `docs/pilot-evidence/index.csv`
- day 1 evidence row is recorded successfully
- day 1 observability row is recorded successfully
- day 1 decision row is recorded successfully
- no `sev1` or `sev2`
- no privacy, tenancy, or artifact-custody failure

## Amber Conditions

`PD01` is `amber` if:

- the core artifact set exists
- no critical security or tenancy issue appears
- but a non-critical issue needs ownership before Day 2

Typical examples:

- expected-noise log sweep needs follow-up explanation
- a non-critical report field is incomplete but fixable
- command output is correct but operator notes are unclear

## Red Conditions

`PD01` is `red` if any of these occur:

- release gate fails
- pilot-entry artifact set is incomplete
- pointer row is wrong or missing
- copied evidence index is not created
- critical privacy, tenancy, RBAC, agreement, or rollback issue appears
- decision custody cannot be proven

Expected decision in this state:

- `hotfix` or `stop`

## Blocked Conditions

`PD01` is `blocked` if:

- evidence exists only partially and you cannot trust the result
- required release report path is unknown
- observability row or decision row was not recorded
- the daily sheet was not filled enough to support a trustworthy canonical row

`blocked` means rerun or repair before treating Day 1 as complete.

## Orchestration Traceability Requirement

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

If no worker lanes are used, record `single-orchestrator run` and explain why.

## Day 1 Note-Taking Guidance

Use the daily sheet to capture:

- release report path
- evidence bundle path
- any boundary observations
- log sweep outcome
- admin review note
- branch manager note if relevant
- exact final color and decision

Then transfer the canonical facts into the copied pilot evidence index through the pilot commands.

## Scenario-Specific Checklist

- [ ] pilot id chosen
- [ ] `pnpm pilot:check` passed
- [ ] `pnpm release:gate:prod -- --pilotId <pilot-id>` passed
- [ ] release report path captured
- [ ] copied evidence index path captured
- [ ] pointer row verified
- [ ] daily sheet filled
- [ ] `day-1` evidence row recorded
- [ ] `day-1` observability row recorded
- [ ] `day-1` decision row recorded
- [ ] final color assigned
- [ ] final decision assigned

## Coverage

`PD01` validates:

- published commercial promise surfaces remain visible
- pilot-entry artifact custody is canonical
- readiness-command authority is working
- Day 1 evidence can be recorded without ad hoc notes

Mapped tranche coverage:

- `P1C`
- `P1T`
- `P6`
- `P7`
- `P8R/RG01-RG05`
