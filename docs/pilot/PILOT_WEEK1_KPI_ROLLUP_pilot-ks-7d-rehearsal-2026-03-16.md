# Pilot Week-1 KPI / SLA Rollup

- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Date: `2026-03-17`
- Owner: `Platform + Admin KS`
- Scope: `post-pilot closeout for the completed P8P seven-day rehearsal`

## Source Artifacts

- KPI definitions: `docs/pilot/PILOT_KPIS.md`
- Go/no-go thresholds: `docs/pilot/PILOT_GO_NO_GO.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Day 4 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-4.md`
- Day 7 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-7d-rehearsal-2026-03-16_day-7.md`
- Canonical executive review: `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-7d-rehearsal-2026-03-16.md`

## Executive Summary

- Governance and observability stayed bounded across the recorded week-1 review set.
- The repo now contains a week-1 KPI/SLA rollup artifact.
- Controlled live-pilot expansion is still not justified from checked-in evidence alone because the claim-based Day 7 threshold percentages remain unproven in canonical artifacts.
- Recommendation impact: `no change`; keep canonical Day 7 outcome as `amber / pause` with executive recommendation `repeat_with_fixes`.

## Quantified Week-1 Results

| Area                         | Target or question                                        | Repo-backed result                                                                                                                                                                   | Judgment        | Evidence                                              |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------- |
| Daily operating posture      | 7-day rehearsal completed with bounded daily status trail | `7/7` operating rows recorded; `6/7` `green`, `1/7` `amber`, `0/7` `red` or `blocked`                                                                                                | `bounded pass`  | copied evidence index day table                       |
| Daily decision posture       | stable daily decision trail                               | `6/7` daily decisions `continue`; `1/7` daily decision `pause` (`day-7`)                                                                                                             | `bounded pass`  | copied evidence index decision log                    |
| Weekly decision posture      | final weekly closeout recorded                            | `1/1` weekly decision recorded as `pause` (`week-1`)                                                                                                                                 | `complete`      | copied evidence index decision log                    |
| Incident severity            | no unresolved Sev1/Sev2 older than one operating day      | `0` incidents on all `7` daily rows; observability rows show `0` incident count and highest severity `none` across `day-1` through `day-7` and `week-1`                              | `met`           | copied evidence index day table and observability log |
| Observability quietness      | no `action-required` log posture                          | `8/8` recorded observability windows were `expected-noise`; `0/8` were `action-required`; functional errors `0/8`                                                                    | `met`           | copied evidence index observability log               |
| KPI-condition posture        | stay out of `breach`                                      | `6/8` windows `within-threshold`, `2/8` windows `watch`, `0/8` windows `breach`                                                                                                      | `bounded watch` | copied evidence index observability log               |
| Fresh verification authority | keep repo-backed verification green during the rehearsal  | `Inference:` Day 1 recorded a `GO` release gate, and Days 2-7 each recorded a fresh `pilot:check` success, giving `7/7` recorded operating windows with green verification authority | `supported`     | day-1 through day-7 daily sheets                      |
| Branch-pressure proof        | Day 4 pressure remains bounded                            | targeted Day 4 rerun passed `2` matter-allowance tests, `4` staff-queue tests, and `12` branch-dashboard tests                                                                       | `met`           | Day 4 daily sheet                                     |

## Day-7 Threshold Closure

| Threshold                          | Required result                                                 | Rollup result                                                                                                                                                                                         | Closure     |
| ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Triage SLA                         | `<= 4` operating hours on at least `90%` of claims              | No checked-in week-1 numerator/denominator or timestamp rollup proves this percentage                                                                                                                 | `unproven`  |
| Update SLA                         | `<= 24` operating hours post-triage on at least `90%` of claims | No checked-in week-1 numerator/denominator or timestamp rollup proves this percentage                                                                                                                 | `unproven`  |
| Sev1/Sev2 age                      | no unresolved Sev1/Sev2 older than one operating day            | `0` Sev1 and `0` Sev2 incidents recorded across the week-1 evidence set                                                                                                                               | `met`       |
| `pnpm e2e:gate` pass posture       | `100%`                                                          | `Inference:` recorded weekly verification authority stayed green because Day 1 release gate passed and Days 2-7 fresh `pilot:check` runs exited `0`, and `pilot:check` includes the gate pack         | `supported` |
| `pnpm security:guard` pass posture | `100%`                                                          | `Inference:` recorded weekly verification authority stayed green because Day 1 release gate passed and Days 2-7 fresh `pilot:check` runs exited `0`, and `pilot:check` includes `pnpm security:guard` | `supported` |
| Executive review custody           | clear final recommendation with owners                          | canonical executive review exists and remains linked to the copied evidence index, Day 7 daily sheet, and this rollup                                                                                 | `met`       |

## KPI Coverage Status

| KPI                               | Target                        | Status from canonical artifacts | Notes                                                                                       |
| --------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| Claim Start Rate                  | `>= 30%`                      | `unproven`                      | no cohort numerator or denominator is rolled up in the copied evidence set                  |
| Claims Submitted                  | within planned cohort volume  | `unproven`                      | no checked-in submitted-claim count is rolled up                                            |
| Agent First Response Time         | `<= 2` operating hours median | `unproven`                      | handoff behavior is qualitatively evidenced, but no median timestamp rollup is checked in   |
| Staff Triage Time                 | `<= 4` operating hours median | `unproven`                      | Day 4 proves surface behavior, not week-1 median timing                                     |
| 1 Operating-Day Update Compliance | `>= 90%`                      | `unproven`                      | no checked-in compliance percentage exists                                                  |
| 2 Operating-Day Progression Rate  | `>= 85%`                      | `unproven`                      | no numerator or denominator is rolled up                                                    |
| Reopen Rate                       | `<= 10%`                      | `unproven`                      | no reopen count or percentage is rolled up                                                  |
| Handoff Completeness              | `>= 95%`                      | `unproven`                      | workflow quality is qualitative in the current repo-backed trail                            |
| Readiness Marker Integrity        | `100%`                        | `partially evidenced`           | gate/rerun evidence stayed green, but no explicit weekly numerator/denominator sheet exists |
| E2E Gate Pass Rate                | `100%`                        | `supported`                     | see threshold-closure note above                                                            |
| Security Guard Pass Rate          | `100%`                        | `supported`                     | see threshold-closure note above                                                            |
| Critical Data/Security Incidents  | `0`                           | `met`                           | `0` incidents and highest severity `none` across the recorded week-1 evidence set           |

## Closeout Judgment

- The missing week-1 rollup artifact is now checked in.
- The rollup closes evidence-custody ambiguity, but it does not convert the Day 7 result to `expand`.
- The remaining blocker to wider rollout is now narrower and explicit: claim-timestamp- or read-model-backed weekly KPI/SLA percentages are still absent from the canonical evidence set.

## Configured Database Snapshot Check

- Command family used: `node scripts/run-with-dotenv.mjs node - <<'EOF' ... EOF`
- Result from the configured `DATABASE_URL` on `2026-03-17`:
  - `tenant_ks` had `1` claim created on or after `2026-03-15`
  - that claim was still `draft`
  - it had `0` `claim_stage_history` rows
- Impact:
  - the configured database snapshot cannot produce the week-1 triage or update SLA percentages for the KS pilot window
  - the remaining evidence must therefore come from a canonical source-environment export or a checked-in read-model snapshot rather than the current developer database snapshot

## Required Next Evidence

- Export or check in the canonical week-1 claim cohort timestamps or read-model snapshot for the KS pilot window.
- Produce a checked-in numerator/denominator rollup for week-1 triage SLA and update SLA from that canonical data source.
- Add the corresponding claim-volume and workflow-completeness metrics needed by `docs/pilot/PILOT_KPIS.md` if controlled live-pilot expansion is going to be reconsidered.
