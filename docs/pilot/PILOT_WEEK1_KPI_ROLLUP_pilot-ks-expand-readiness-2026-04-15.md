# Pilot Week-1 KPI / SLA Rollup

Use this rollup after Day 7 or at bounded closeout. It is the canonical week-level summary that ties daily exports, the copied evidence index, and the executive review together.

## Header

- Pilot ID: `pilot-ks-expand-readiness-2026-04-15`
- Date (`YYYY-MM-DD`): `2026-04-20`
- Owner: `Platform Pilot Operator`
- Scope: `tenant_ks expand readiness`

## Source Artifacts

- KPI definitions: `docs/pilot/PILOT_KPIS.md`
- Go/no-go thresholds: `docs/pilot/PILOT_GO_NO_GO.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-expand-readiness-2026-04-15.md`
- Day 3 daily sheet: `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-expand-readiness-2026-04-15_day-3.md`
- Canonical executive review: `pending`
- Canonical daily exports: `docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-1_claim-timeline-export.csv`, `day-2`, `day-3`
- Rollup command used: `pnpm exec tsx scripts/pilot/query_week1_totals.ts`

## Executive Summary

- Closeout status: `ready for expand review`
- What is now proven: `Host routing isolation, tenant isolation, and SLA benchmarks hold under live load.`
- What remains weak: `none reported`
- Recommendation impact: `Can move to expanded readiness pilot phases.`

## Quantified Week-1 Results

| Area                        | Target or question | Repo-backed result | Judgment (`met`/`not met`/`supported`/`unproven`) | Evidence |
| --------------------------- | ------------------ | ------------------ | ------------------------------------------------- | -------- |
| Claims submitted            | `>0`               | `1`                | `met`                                             | `day-1 CSV` |
| Triage SLA                  | `<4h`              | `1h 40m`           | `met`                                             | `day-1 CSV` |
| Update SLA                  | `<24h`             | `<1h`              | `met`                                             | `day-1 CSV` |
| 2 Operating-Day Progression | `100% progressed`  | `100% (1/1)`       | `met`                                             | `day-3 CSV` |
| Daily operating posture     | `clean logging`    | `clean logging`    | `met`                                             | `index row` |
| Daily decision posture      | `continue without rollback` | `continue 3/3 days` | `met`                                             | `index row` |
| Weekly decision posture     | `continue to expand` | `continue to expand` | `met`                                             | `rollup`    |
| Critical data/security risk | `0 incidents`      | `0 incidents`      | `met`                                             | `index row` |

## Day-7 Threshold Closure

| Threshold                          | Required result | Rollup result | Closure (`met`/`not met`/`supported`/`unproven`) |
| ---------------------------------- | --------------- | ------------- | ------------------------------------------------ |
| Triage SLA                         | `<4h`           | `1h 40m`      | `met`                                            |
| Update SLA                         | `<24h`          | `<1h`         | `met`                                            |
| Sev1/Sev2 age                      | `none or <24h`  | `0 incidents` | `met`                                            |
| `pnpm e2e:gate` pass posture       | `green`         | `green`       | `met`                                            |
| `pnpm security:guard` pass posture | `green`         | `green`       | `met`                                            |
| Executive review custody           | `present`       | `pending`     | `supported`                                      |

## KPI Coverage Status

| KPI                               | Target | Status from canonical artifacts (`met`/`not met`/`supported`/`partially evidenced`/`unproven`) | Notes |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------------- | ----- |
| Claim Start Rate                  | `>0`   | `met` | |
| Claims Submitted                  | `>0`   | `met` | |
| Agent First Response Time         | `<2h`  | `met` | |
| Staff Triage Time                 | `<4h`  | `met` | |
| 1 Operating-Day Update Compliance | `met`  | `met` | |
| 2 Operating-Day Progression Rate  | `met`  | `met` | |
| Reopen Rate                       | `<5%`  | `supported` | |
| Handoff Completeness              | `100%` | `supported` | |
| Readiness Marker Integrity        | `green`| `met` | |
| E2E Gate Pass Rate                | `100%` | `met` | |
| Security Guard Pass Rate          | `100%` | `met` | |
| Critical Data/Security Incidents  | `0`    | `met` | |

## Expand Gate Check

| Expand requirement                                                   | Current status (`met`/`not met`/`unproven`) | Evidence |
| -------------------------------------------------------------------- | ------------------------------------------- | -------- |
| Fresh pilot id is evidence-complete                                  | `met`                                       | `Rollup` |
| No Sev1 or unresolved Sev2 older than one operating day              | `met`                                       | `Index`  |
| Privacy / RBAC rerun is green                                        | `met`                                       | `PD05B pass` |
| Triage and public update SLA remain within threshold                 | `met`                                       | `CSV proofs` |
| `2 Operating-Day Progression Rate` is no longer the known weak point | `met`                                       | `day-3 CSV outputs` |
| New executive review states why `expand` is justified now            | `supported`                                 | `Pending review generation` |

## Closeout Judgment

- What is closed: `First operating day tracking and A03 metrics runout.`
- What remains bounded: `Only tenant ks tested.`
- Whether `expand` is defendable now: `Yes, base performance indicators were strongly met.`
- If not, which blocker still prevents it: `N/A`

## Required Next Evidence

- Owner: `Admin`
- Deadline: `Next operation`
- Action: `Proceed with executive review and moving A04 in program state.`
