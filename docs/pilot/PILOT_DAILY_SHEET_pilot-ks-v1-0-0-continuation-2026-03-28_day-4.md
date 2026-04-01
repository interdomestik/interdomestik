# Pilot Day 4 Daily Sheet

This file is the working-note layer only. The copied `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` file remains the canonical pilot record.

After completing the sheet, write the canonical rows with:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
```

## Live-Day Rule

Day 4 is no longer blocked. The canonical `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` file now contains the supported day-4 evidence, observability, and decision rows after the production-backed export proved real claim rows plus real `claim_stage_history` rows for the `2026-03-31` window.

## Pilot Day Header

- Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`
- Day Number: `4`
- Date (`YYYY-MM-DD`): `2026-03-31`
- Scenario ID (`PD01`-`PD07`): `PD01`
- Scenario Name: `Continuation Live Claim Intake And SLA Evidence Capture`
- Mode (`live`): `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `no`
- Admin Reviewer: `Admin KS`
- Shift Window (`HH:MM-HH:MM`, local timezone): `08:00-17:00 Europe/Pristina`
- Canonical data source: `production claim + claim_stage_history rows for tenant_ks continuation cohort`
- Daily export path: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-4_claim-timeline-export.csv`

## Day Objective

- Primary objective: `capture the first claim-bearing continuation export during the active 2026-03-31 operating day`
- SLA proof objective: `produce a day-scoped canonical export with enough claim and timeline data to measure first triage and first public update timing`
- Minimum live-data success condition: `at least 1 real claim row for tenant_ks with at least 1 claim_stage_history row; otherwise keep the sheet blocked and do not write canonical day-4 evidence`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260329`

## Current Snapshot

- Snapshot timestamp: `2026-03-31 16:09:00 CEST` (`2026-03-31 14:09:00 UTC` export-backed view)
- Window checked: `2026-03-31 00:00:00` to `2026-04-01 00:00:00`
- Current distinct claim rows for `tenant_ks`: `4`
- Current `claim_stage_history` rows for those claims: `9`
- Current posture: `claim-bearing day confirmed; canonical day-4 evidence is now written as amber/continue`

## Scenario Mix

| Scenario Slice              | Purpose                                                                 | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes                                                                |
| --------------------------- | ----------------------------------------------------------------------- | --------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Standard claim intake       | establish day-scoped export denominator                                 | `1-3 claims`    | `running`                                    | `07:09 CEST partial snapshot is still zero-row / header-only`        |
| Agent-assisted intake       | verify attribution holds under assisted entry                           | `0-1 claim`     | `missed`                                     | `day-4 evidence came from neutral-host member/staff operations only` |
| Staff triage                | prove first triage timing is measurable                                 | `1-2 claims`    | `done`                                       | `YsiT1kPldWd7Rd0QlWltB advanced from submitted to verification`      |
| Public member update        | prove first member-visible update timing is measurable                  | `1 claim`       | `done`                                       | `member UI confirmed verification badge plus public note visibility` |
| Boundary/privacy spot-check | rely on latest corrected-baseline proof unless a new regression appears | `prior proof`   | `done`                                       | `day-2 PD05B rerun remains the latest explicit privacy / RBAC proof` |

## Claims Created Today

| Claim ID                | Member / Household     | Claim Type | Branch | Created At                | Submitted At              | Current Status | Assigned Agent      | Assigned Staff    | Evidence Ref                                                 |
| ----------------------- | ---------------------- | ---------- | ------ | ------------------------- | ------------------------- | -------------- | ------------------- | ----------------- | ------------------------------------------------------------ |
| `cA9gOhZFPLYOKVzZ8Vsau` | `golden_ks_a_member_1` | `vehicle`  | `KS`   | `2026-03-31 06:36:18 UTC` | `2026-03-31 06:36:18 UTC` | `submitted`    | `n/a`               | `n/a`             | `day-4 export row; branch_id persisted as empty`             |
| `lPXonO6wV5xd_d2DLULp0` | `golden_ks_a_member_1` | `vehicle`  | `KS`   | `2026-03-31 13:56:10 UTC` | `2026-03-31 13:56:10 UTC` | `submitted`    | `n/a`               | `n/a`             | `day-4 export row; branch_id persisted as empty`             |
| `pVPfeijORZ3iGoq29-MHr` | `golden_ks_a_member_1` | `vehicle`  | `KS`   | `2026-03-31 13:59:16 UTC` | `2026-03-31 13:59:16 UTC` | `submitted`    | `n/a`               | `n/a`             | `day-4 export row; branch_id persisted as empty`             |
| `YsiT1kPldWd7Rd0QlWltB` | `golden_ks_a_member_2` | `vehicle`  | `KS`   | `2026-03-31 14:00:49 UTC` | `2026-03-31 14:00:49 UTC` | `verification` | `Blerim Hoxha (UI)` | `golden_ks_staff` | `production DB + member/staff UI proof; public note visible` |

## First-Triage SLA Proof

Target: first staff triage within `4 operating hours` of submission.

| Claim ID                | Submitted At              | First Staff Triage At     | Within 4h (`yes`/`no`) | Proof Source                                | Notes                                     |
| ----------------------- | ------------------------- | ------------------------- | ---------------------- | ------------------------------------------- | ----------------------------------------- |
| `YsiT1kPldWd7Rd0QlWltB` | `2026-03-31 14:00:49 UTC` | `2026-03-31 14:05:50 UTC` | `yes`                  | `production DB claim + claim_stage_history` | `submitted -> verification in ~5 minutes` |

## First Public Update SLA Proof

Target: first member-visible update within `24 operating hours` after triage.

| Claim ID                | First Staff Triage At     | First Public Update At    | Within 24h (`yes`/`no`) | Proof Source                             | Notes                                      |
| ----------------------- | ------------------------- | ------------------------- | ----------------------- | ---------------------------------------- | ------------------------------------------ |
| `YsiT1kPldWd7Rd0QlWltB` | `2026-03-31 14:05:50 UTC` | `2026-03-31 14:05:50 UTC` | `yes`                   | `production DB + member claim detail UI` | `member saw Verification plus public note` |

## SLA Mismatch Log

| Ref                        | Mismatch                                                                       | Severity (`sev3`/`sev2`/`sev1`) | Owner                     | Required Action                                                                                  | Resolved (`yes`/`no`) |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| `resend-api-key`           | `runtime logs on POST /en/member/claims/new show Resend API key invalid (401)` | `sev3`                          | `Platform Pilot Operator` | `repair production outbound email credentials before treating day-4 as green`                    | `no`                  |
| `neutral-host-branch-null` | `all day-4 neutral-host tenant_ks claims persisted with empty branch_id`       | `sev3`                          | `Platform Pilot Operator` | `trace neutral-host claim write path and restore branch attribution before expand consideration` | `no`                  |

## Boundary And Privacy Spot-Checks

| Check                                      | Result (`pass`/`fail`) | Evidence Ref        | Notes                                                                                              |
| ------------------------------------------ | ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| Cross-tenant isolation                     | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green; no day-4 contrary signal observed so far` |
| Cross-branch isolation                     | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green; no day-4 contrary signal observed so far` |
| Member cannot see staff-only notes         | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green; no day-4 contrary signal observed so far` |
| Agent sees only permitted members / claims | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green; no day-4 contrary signal observed so far` |

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `action-required`
- Functional errors count: `1`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `watch`
- Incident count: `1`
- Highest severity: `sev3`
- Incident refs: `resend-api-key`
- Notes: `Production continuation proof is now present on Supabase project gunosplgrvnvrftudttr. The day-4 export contains 4 tenant_ks claims and 9 timeline rows, including YsiT1kPldWd7Rd0QlWltB submitted at 2026-03-31 14:00:49.723295 UTC and advanced to verification with a public note at 2026-03-31 14:05:50.651 UTC. Action-required defects remain: claim-submitted email failed with Resend 401 invalid API key, and live neutral-host day-4 claims persisted with empty branch_id.`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                               |
| -------------------------- | ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release gate               | `pass`                 | `none`                                         | `reuse corrected-baseline GO docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`                                          |
| Security and boundary      | `pass`                 | `none`                                         | `latest explicit PD05B corrected-baseline proof remains green`                                                                                      |
| Operational behavior       | `pass`                 | `sev3`                                         | `live day-4 claim cohort exists and same-day submitted -> verification progression is proven; outbound email and branch attribution defects remain` |
| Role workflow              | `pass`                 | `sev3`                                         | `member submit, staff assignment/status update, and member-visible note all worked on production`                                                   |
| Observability and evidence | `pass`                 | `sev3`                                         | `day-4 canonical evidence is now defensible as amber, not green`                                                                                    |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `amber`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Branch manager recommendation: `continue with explicit remediation on outbound email and branch attribution before any expand discussion`
- Admin decision: `continue`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `n/a`

## Required Follow-Up

| Owner                     | Deadline                           | Action                                                                                                     |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Platform Pilot Operator` | `before the next continuation day` | `repair production Resend configuration so claim-submitted email no longer fails with 401 invalid API key` |
| `Platform Pilot Operator` | `before any expand recommendation` | `repair neutral-host claim branch attribution so tenant_ks claims do not persist with empty branch_id`     |

## Evidence References

- Release report: `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md`
- Daily export or snapshot: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-4_claim-timeline-export.csv`
- Query or script used for daily export: `docs/pilot/live-data/pilot-claim-timeline-export.template.sql` with `tenant_id=tenant_ks`, `export_window_start=2026-03-31 00:00:00`, `export_window_end=2026-04-01 00:00:00`
- Observability reference (`day-<n>`/`week-<n>`): `day-4`
- Decision reference (`day-<n>`/`week-<n>`): `day-4`
- Other repo-backed evidence: `production Vercel inspect confirmed alias dpl_GtFCDLYXGiZDyxueeqfckGFsLnMh; production DB project ref is gunosplgrvnvrftudttr; member UI showed Verification and the public status note for YsiT1kPldWd7Rd0QlWltB`

## Summary Notes

- What passed: `production neutral-host member submit persisted real tenant_ks claims, staff assigned and advanced YsiT1kPldWd7Rd0QlWltB to verification, and the member saw the public note in the live UI`
- What failed: `claim-submitted email failed with Resend 401 invalid API key, and day-4 neutral-host claims persisted without branch attribution`
- What needs follow-up later today: `keep day-5 focused on repeated real progression plus remediation proof for outbound email and branch attribution`
- Anything that could change go/no-go posture: `day-4 removed the “no claim-bearing proof” blocker, but expand readiness remains paused until the known sev3 defects are corrected and repeated evidence holds`
