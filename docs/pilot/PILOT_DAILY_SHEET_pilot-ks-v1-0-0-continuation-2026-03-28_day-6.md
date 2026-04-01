# Pilot Day 6 Daily Sheet

This file is the working-note layer only. The copied `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` file remains the canonical pilot record.

After completing the sheet, write the canonical rows with:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
```

## Live-Day Rule

Day 6 is the next full corrected-baseline operating day after the day-5 Sev3 follow-up.

Every day must end with a repo-backed export or snapshot that proves:

- real claims were created that day
- real `claim_stage_history` rows exist for those claims
- first triage timing can be measured
- first public update timing can be measured

If that evidence is missing, the day is `blocked` in working notes and must not be carried into the canonical evidence index until fixed.

## Pilot Day Header

- Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`
- Day Number: `6`
- Date (`YYYY-MM-DD`): `2026-04-01`
- Scenario ID (`PD01`-`PD07`): `PD01`
- Scenario Name: `Corrected-Baseline Live Claim Intake And SLA Re-Proof`
- Mode (`live`): `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `no`
- Admin Reviewer: `Admin KS`
- Shift Window (`HH:MM-HH:MM`, local timezone): `08:00-17:00 Europe/Pristina`
- Canonical data source: `production claim + claim_stage_history rows for tenant_ks continuation cohort`
- Daily export path: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-timeline-export.csv`

## Day Objective

- Primary objective: `capture a fresh claim-bearing corrected-baseline day after branch-attribution and Resend repair`
- SLA proof objective: `produce a day-scoped canonical export with enough claim and timeline data to measure first triage and first public update timing`
- Minimum live-data success condition: `at least 1 real claim row for tenant_ks with at least 1 claim_stage_history row; otherwise keep the sheet blocked and do not write canonical day-6 evidence`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260329`

## Scenario Mix

| Scenario Slice                 | Purpose                                               | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------- | --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard claim intake          | establish day-scoped export denominator               | `1-3 claims`    | `done`                                       | `2 real tenant_ks claims created in the April 1 window: vv28_bD0sbkn-2_H8usBH and Tl_kfpOfE2qPdXNGUj-PI`                                                   |
| Agent-assisted intake          | verify attribution holds under assisted entry         | `0-1 claim`     | `missed`                                     | `not exercised in this morning snapshot`                                                                                                                   |
| Staff triage                   | prove first triage timing is measurable               | `1-2 claims`    | `done`                                       | `Tl_kfpOfE2qPdXNGUj-PI moved from submitted to verification at 2026-04-01 07:22:08.741 UTC; vv28_bD0sbkn-2_H8usBH followed at 2026-04-01 07:27:30.858 UTC` |
| Public member update           | prove first public update timing is measurable        | `1 claim`       | `done`                                       | `public claim messages persisted at 2026-04-01 07:22:14.285372 UTC and 2026-04-01 07:27:36.191632 UTC`                                                     |
| Branch-pressure sample         | observe KS release surface under real load            | `0-1 sample`    | `done`                                       | `current morning operating slice produced two real claims and two full staff loops without branch-attribution regression`                                  |
| Boundary/privacy spot-check    | rely on latest corrected-baseline boundary proof      | `prior proof`   | `done`                                       | `reuse PD05B rerun unless a new contrary signal appears`                                                                                                   |
| Communications/fallback sample | confirm corrected production email path remains clean | `1 sample`      | `done`                                       | `Resend path was repaired on day 5; no fresh contrary signal observed in the April 1 proof run`                                                            |

## Live Operator Roster

| Role           | Name / Handle   | Branch | Window             | Notes                                            |
| -------------- | --------------- | ------ | ------------------ | ------------------------------------------------ |
| Member(s)      | `KS A-Member 1` | `KS`   | `full day window`  | `member.ks.a1@interdomestik.com`                 |
| Agent(s)       | `Blerim Hoxha`  | `KS`   | `full day window`  | `agent attribution present on both day-6 claims` |
| Staff          | `Drita Gashi`   | `KS`   | `full day window`  | `staff.ks@interdomestik.com`                     |
| Branch Manager | `n/a`           | `KS`   | `not yet reviewed` | `working-note only at this stage`                |
| Admin          | `Admin KS`      | `KS`   | `not yet reviewed` | `working-note only at this stage`                |

## Claims Created Today

| Claim ID                | Member / Household | Claim Type | Branch        | Created At                       | Submitted At                     | Current Status | Assigned Agent                      | Assigned Staff                  | Evidence Ref                                                                        |
| ----------------------- | ------------------ | ---------- | ------------- | -------------------------------- | -------------------------------- | -------------- | ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `vv28_bD0sbkn-2_H8usBH` | `KS A-Member 1`    | `vehicle`  | `ks_branch_a` | `2026-04-01 07:13:51.260209 UTC` | `2026-04-01 07:13:51.260209 UTC` | `verification` | `golden_ks_agent_a1 / Blerim Hoxha` | `golden_ks_staff / Drita Gashi` | `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-proof.md` |
| `Tl_kfpOfE2qPdXNGUj-PI` | `KS A-Member 1`    | `vehicle`  | `ks_branch_a` | `2026-04-01 07:14:36.203024 UTC` | `2026-04-01 07:14:36.203024 UTC` | `verification` | `golden_ks_agent_a1 / Blerim Hoxha` | `golden_ks_staff / Drita Gashi` | `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-proof.md` |

## First-Triage SLA Proof

Target: first staff triage within `4 operating hours` of submission.

| Claim ID                | Submitted At                     | First Staff Triage At         | Within 4h (`yes`/`no`) | Proof Source                           | Notes                  |
| ----------------------- | -------------------------------- | ----------------------------- | ---------------------- | -------------------------------------- | ---------------------- |
| `Tl_kfpOfE2qPdXNGUj-PI` | `2026-04-01 07:14:36.203024 UTC` | `2026-04-01 07:22:08.741 UTC` | `yes`                  | `claim_stage_history verification row` | `elapsed 00:07:32.538` |
| `vv28_bD0sbkn-2_H8usBH` | `2026-04-01 07:13:51.260209 UTC` | `2026-04-01 07:27:30.858 UTC` | `yes`                  | `claim_stage_history verification row` | `elapsed 00:13:39.598` |

## First Public Update SLA Proof

Target: first member-visible update within `24 operating hours` after triage.

| Claim ID                | First Staff Triage At         | First Public Update At           | Within 24h (`yes`/`no`) | Proof Source                               | Notes                                  |
| ----------------------- | ----------------------------- | -------------------------------- | ----------------------- | ------------------------------------------ | -------------------------------------- |
| `Tl_kfpOfE2qPdXNGUj-PI` | `2026-04-01 07:22:08.741 UTC` | `2026-04-01 07:22:14.285372 UTC` | `yes`                   | `claim_messages row 73hyFLuuGOg60HrjvDAJR` | `elapsed 00:00:05.544372 after triage` |
| `vv28_bD0sbkn-2_H8usBH` | `2026-04-01 07:27:30.858 UTC` | `2026-04-01 07:27:36.191632 UTC` | `yes`                   | `claim_messages row Gi-iVVMAMs6WwJxLVzRog` | `elapsed 00:00:05.333632 after triage` |

## SLA Mismatch Log

Use this section for anything that weakens proof, including late triage, late public updates, missing timeline rows, wrong branch attribution, or uncertainty in operating-hours math.

| Claim ID | Mismatch Type | Severity (`sev3`/`sev2`/`sev1`) | Owner | Follow-Up | Resolved (`yes`/`no`) |
| -------- | ------------- | ------------------------------- | ----- | --------- | --------------------- |

## Boundary And Privacy Spot-Checks

| Check                                                   | Result (`pass`/`fail`) | Evidence Ref          | Notes                                                    |
| ------------------------------------------------------- | ---------------------- | --------------------- | -------------------------------------------------------- |
| Cross-tenant isolation                                  | `pass`                 | `day-2 PD05B rerun`   | `latest explicit corrected-baseline proof remains green` |
| Cross-branch isolation                                  | `pass`                 | `day-2 PD05B rerun`   | `day-6 claims persisted with branch_id = ks_branch_a`    |
| Member cannot see staff-only notes                      | `pass`                 | `day-2 PD05B rerun`   | `latest explicit corrected-baseline proof remains green` |
| Agent sees only permitted members / claims              | `pass`                 | `day-2 PD05B rerun`   | `latest explicit corrected-baseline proof remains green` |
| Admin / branch dashboards stay aggregate where expected | `pass`                 | `prior gate coverage` | `no contrary signal observed in this morning snapshot`   |

## Communications And Recovery Notes

- Email: `day-5 corrected baseline remains the latest direct Resend credential proof; no fresh failure reproduced in the late-day April 1 check`
- In-app messaging: `public member messages persisted on Tl_kfpOfE2qPdXNGUj-PI at 2026-04-01 07:22:14.285372 UTC and vv28_bD0sbkn-2_H8usBH at 2026-04-01 07:27:36.191632 UTC`
- Voice / hotline:
- WhatsApp or fallback:
- Recovery or escalation path used: `standard live member claim + live staff triage and public update on production`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `clear`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `within-threshold`
- Incident count: `0`
- Highest severity: `none`
- Incident refs: `none`
- Notes: `Late-day rerun of scripts/pilot/query_week1_totals.ts remains triage 2 / 2 (100.0%), update 2 / 2 (100.0%), progression 2 / 2 (100.0%), with 0 claims missing triage evidence and 0 claims missing public update evidence. No fresh branch-attribution or Resend signal appeared in the late-day April 1 check.`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                      |
| -------------------------- | ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Release gate               | `pass`                 | `none`                                         | `reuse corrected-baseline GO release report from 2026-03-28`                                                               |
| Security and boundary      | `pass`                 | `none`                                         | `latest explicit PD05B corrected-baseline proof remains green`                                                             |
| Operational behavior       | `pass`                 | `none`                                         | `April 1 live claims again persisted with tenant_ks and branch_id = ks_branch_a`                                           |
| Role workflow              | `pass`                 | `none`                                         | `live staff assignment, verification transition, and member-visible message all persisted for both current April 1 claims` |
| Observability and evidence | `pass`                 | `none`                                         | `current April 1 window now has complete claim, stage-history, and public-message proof for both day-window claims`        |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `green`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Branch manager recommendation: `continue the bounded line and carry this April 1 day as a clean corrected-baseline proof point`
- Admin decision: `continue`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `n/a`

## Required Follow-Up

| Owner                     | Deadline                       | Action                                                                                                                     |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `Platform Pilot Operator` | `next continuation review`     | `confirm that this April 1 2 / 2 progression improvement is durable enough to weaken the known progression-risk narrative` |
| `Platform Pilot Operator` | `before any expand discussion` | `accumulate more than one good operating slice and complete the remaining exec-review evidence chain`                      |

## Evidence References

- Release report: `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md`
- Daily export or snapshot: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-timeline-export.csv`
- Query or script used for daily export: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-timeline-export.sql`
- Observability reference (`day-<n>`/`week-<n>`): `day-6`
- Decision reference (`day-<n>`/`week-<n>`): `day-6`
- Other repo-backed evidence: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-6_claim-proof.md; tsx rollup snapshot for 2026-04-01 -> 2026-04-02`

## Summary Notes

- What passed: `April 1 on corrected production now has two real KS claims in the day window, both fully measured with live staff assignment, verification transition, and public member message, and no branch-attribution regression`
- What failed: `nothing fresh has failed in the current April 1 snapshot`
- What needs follow-up tomorrow: `continue the bounded line and watch whether this strong day-6 performance repeats`
- Anything that could change go/no-go posture: `the active day-window snapshot is currently 2 / 2 on progression, which is materially better than the known weak point, but one same-day slice alone is still not the full expand case`

## Day-Close Note

This day is now frozen into canonical evidence. It improves the progression narrative materially for one operating slice, but it does not by itself satisfy the full expand standard.
