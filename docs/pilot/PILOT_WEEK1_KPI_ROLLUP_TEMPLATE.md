# Pilot Week-1 KPI / SLA Rollup Template

Copy this file to `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_<pilot-id>.md`.

Use this rollup after Day 7 or at bounded closeout. It is the canonical week-level summary that ties daily exports, the copied evidence index, and the executive review together.

## Header

- Pilot ID:
- Date (`YYYY-MM-DD`):
- Owner:
- Scope:

## Source Artifacts

- KPI definitions: `docs/pilot/PILOT_KPIS.md`
- Go/no-go thresholds: `docs/pilot/PILOT_GO_NO_GO.md`
- Copied evidence index:
- Day 7 daily sheet:
- Canonical executive review:
- Canonical daily exports:
- Rollup command used:

## Executive Summary

- Closeout status:
- What is now proven:
- What remains weak:
- Recommendation impact:

## Quantified Week-1 Results

| Area                        | Target or question | Repo-backed result | Judgment (`met`/`not met`/`supported`/`unproven`) | Evidence |
| --------------------------- | ------------------ | ------------------ | ------------------------------------------------- | -------- |
| Claims submitted            |                    |                    |                                                   |          |
| Triage SLA                  |                    |                    |                                                   |          |
| Update SLA                  |                    |                    |                                                   |          |
| 2 Operating-Day Progression |                    |                    |                                                   |          |
| Daily operating posture     |                    |                    |                                                   |          |
| Daily decision posture      |                    |                    |                                                   |          |
| Weekly decision posture     |                    |                    |                                                   |          |
| Critical data/security risk |                    |                    |                                                   |          |

## Day-7 Threshold Closure

| Threshold                          | Required result | Rollup result | Closure (`met`/`not met`/`supported`/`unproven`) |
| ---------------------------------- | --------------- | ------------- | ------------------------------------------------ |
| Triage SLA                         |                 |               |                                                  |
| Update SLA                         |                 |               |                                                  |
| Sev1/Sev2 age                      |                 |               |                                                  |
| `pnpm e2e:gate` pass posture       |                 |               |                                                  |
| `pnpm security:guard` pass posture |                 |               |                                                  |
| Executive review custody           |                 |               |                                                  |

## KPI Coverage Status

| KPI                               | Target | Status from canonical artifacts (`met`/`not met`/`supported`/`partially evidenced`/`unproven`) | Notes |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------------- | ----- |
| Claim Start Rate                  |        |                                                                                                |       |
| Claims Submitted                  |        |                                                                                                |       |
| Agent First Response Time         |        |                                                                                                |       |
| Staff Triage Time                 |        |                                                                                                |       |
| 1 Operating-Day Update Compliance |        |                                                                                                |       |
| 2 Operating-Day Progression Rate  |        |                                                                                                |       |
| Reopen Rate                       |        |                                                                                                |       |
| Handoff Completeness              |        |                                                                                                |       |
| Readiness Marker Integrity        |        |                                                                                                |       |
| E2E Gate Pass Rate                |        |                                                                                                |       |
| Security Guard Pass Rate          |        |                                                                                                |       |
| Critical Data/Security Incidents  |        |                                                                                                |       |

## Expand Gate Check

| Expand requirement                                                   | Current status (`met`/`not met`/`unproven`) | Evidence |
| -------------------------------------------------------------------- | ------------------------------------------- | -------- |
| Fresh pilot id is evidence-complete                                  |                                             |          |
| No Sev1 or unresolved Sev2 older than one operating day              |                                             |          |
| Privacy / RBAC rerun is green                                        |                                             |          |
| Triage and public update SLA remain within threshold                 |                                             |          |
| `2 Operating-Day Progression Rate` is no longer the known weak point |                                             |          |
| New executive review states why `expand` is justified now            |                                             |          |

## Closeout Judgment

- What is closed:
- What remains bounded:
- Whether `expand` is defendable now:
- If not, which blocker still prevents it:

## Required Next Evidence

- Owner:
- Deadline:
- Action:
