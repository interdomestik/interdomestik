# Pilot Week-1 KPI / SLA Rollup

- Pilot ID: `pilot-ks-live-2026-03-18`
- Date: `2026-03-24`
- Owner: `Platform + Admin KS`
- Scope: `post-pilot closeout for the live week-1 KS cohort`

## Source Artifacts

- KPI definitions: `docs/pilot/PILOT_KPIS.md`
- Go/no-go thresholds: `docs/pilot/PILOT_GO_NO_GO.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-live-2026-03-18.md`
- Day 7 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-live-2026-03-18_day-7.md`
- Canonical executive review: `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-live-2026-03-18.md`
- Canonical daily exports: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-1_claim-timeline-export.csv` through `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-7_claim-timeline-export.csv`

## Executive Summary

- The live week-1 closeout now has a checked-in KPI/SLA rollup artifact.
- The claim-based Day 7 threshold lines are now proven from canonical claim, timeline, and message timestamps.
- Day 7 itself was a closeout-only `PD07` window with optional traffic; the week-1 cohort therefore closes from the six claim-bearing daily exports plus the Day 7 executive-review artifacts.
- Recommendation impact: `no change`; keep the canonical Day 7 outcome as `amber / pause` with executive recommendation `repeat_with_fixes` because the live week required post-hoc canonical data repairs before the thresholds were defensible.

## Quantified Week-1 Results

| Area                        | Target or question                                    | Repo-backed result                                                                   | Judgment       | Evidence                        |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- | ------------------------------- |
| Claims submitted            | within planned pilot cohort volume                    | `53` KS claims were created between `2026-03-18` and `2026-03-23`                    | `met`          | canonical daily exports         |
| Triage SLA                  | `<= 4` operating hours on at least `90%` of claims    | `52 / 53 = 98.1%` from first post-create timeline rows                               | `met`          | canonical DB rollup + CSVs      |
| Update SLA                  | `<= 24` operating hours post-triage on at least `90%` | `52 / 53 = 98.1%` from first post-triage public messages                             | `met`          | canonical DB rollup + CSVs      |
| 2 Operating-Day Progression | `>= 85%` of claims progress within `48` hours         | `24 / 53 = 45.3%` reached `verification`, `evaluation`, `negotiation`, or `resolved` | `not met`      | canonical DB rollup             |
| Daily operating posture     | stable bounded daily evidence trail                   | `6/7` daily rows `green`; `1/7` daily row `amber`; `0/7` rows `red` or `blocked`     | `bounded pass` | copied evidence index day table |
| Daily decision posture      | stable daily decision trail                           | `6/7` daily decisions `continue`; `1/7` daily decision `pause` (`day-7`)             | `bounded pass` | copied evidence index decision  |
| Weekly decision posture     | final weekly closeout recorded                        | `1/1` weekly closeout remains `pause` after the repaired canonical rollup            | `complete`     | copied evidence index decision  |
| Critical data/security risk | no unresolved Sev1 incidents                          | `0` Sev1 incidents; one repaired Sev2 data-integrity issue from Day 2 remains noted  | `bounded pass` | copied evidence index           |

## Day-7 Threshold Closure

| Threshold                          | Required result                                                 | Rollup result                                                                                   | Closure     |
| ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| Triage SLA                         | `<= 4` operating hours on at least `90%` of claims              | `52 / 53 = 98.1%`                                                                               | `met`       |
| Update SLA                         | `<= 24` operating hours post-triage on at least `90%` of claims | `52 / 53 = 98.1%`                                                                               | `met`       |
| Sev1/Sev2 age                      | no unresolved Sev1/Sev2 older than one operating day            | no unresolved Sev1 or Sev2 remains open in the checked-in closeout trail                        | `met`       |
| `pnpm e2e:gate` pass posture       | `100%`                                                          | `Inference:` launch gate and carried-forward pilot readiness remained green in the evidence set | `supported` |
| `pnpm security:guard` pass posture | `100%`                                                          | `Inference:` launch gate and carried-forward pilot readiness remained green in the evidence set | `supported` |
| Executive review custody           | clear final recommendation with owners                          | canonical executive review exists and now links to this week-1 rollup                           | `met`       |

## KPI Coverage Status

| KPI                               | Target                        | Status from canonical artifacts | Notes                                                                                                |
| --------------------------------- | ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Claim Start Rate                  | `>= 30%`                      | `partially evidenced`           | `4` distinct KS members created claims, but the weekly eligible-member denominator is not checked in |
| Claims Submitted                  | within planned cohort volume  | `met`                           | `53` claims in the canonical week-1 cohort                                                           |
| Agent First Response Time         | `<= 2` operating hours median | `unproven`                      | the checked-in rollup proves first public update SLA, not median first agent action                  |
| Staff Triage Time                 | `<= 4` operating hours median | `met`                           | threshold proof is stronger than the median KPI for this week                                        |
| 1 Operating-Day Update Compliance | `>= 90%`                      | `met`                           | `52 / 53 = 98.1%`                                                                                    |
| 2 Operating-Day Progression Rate  | `>= 85%`                      | `not met`                       | `24 / 53 = 45.3%` based on canonical timeline progression                                            |
| Reopen Rate                       | `<= 10%`                      | `unproven`                      | no checked-in reopen rollup exists in the live closeout set                                          |
| Handoff Completeness              | `>= 95%`                      | `unproven`                      | handoff-context completeness was not rolled up from canonical fields                                 |
| Readiness Marker Integrity        | `100%`                        | `supported`                     | carried-forward gate evidence remained green                                                         |
| E2E Gate Pass Rate                | `100%`                        | `supported`                     | see Day-7 threshold closure                                                                          |
| Security Guard Pass Rate          | `100%`                        | `supported`                     | see Day-7 threshold closure                                                                          |
| Critical Data/Security Incidents  | `0`                           | `bounded miss`                  | the week required one repaired Sev2 tenant-attribution/data-custody issue                            |

## Closeout Judgment

- The Day 7 evidence blocker is closed.
- The header-only Day 7 export is not itself a defect because `PD07` is a closeout-only day and the live sheet already marks Day 7 traffic as optional.
- The real closeout requirement was a repo-backed week-1 KPI/SLA rollup plus the linked weekly observability and decision trail; that evidence is now checked in.
- The recommendation still stays bounded at `repeat_with_fixes` because the week passed only after repairing Day 2 tenant attribution and missing timeline/public-update records in the canonical source.

## Required Next Evidence

- Rerun the Day 5 privacy and RBAC spot-checks against the corrected canonical exports.
- Start the next pilot window only after the hardened pilot helper path produces a clean cohort without post-hoc canonical repairs.
