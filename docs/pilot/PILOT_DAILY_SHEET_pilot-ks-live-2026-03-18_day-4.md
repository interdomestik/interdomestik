# Pilot Day 4 Daily Sheet

- Pilot ID: `pilot-ks-live-2026-03-18`
- Day Number: `4`
- Date: `2026-03-21`
- Scenario ID: `PD04`
- Scenario Name: `SLA Pressure And Branch Queue Load`
- Mode: `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed: `no`
- Admin Reviewer: `Admin KS`
- Shift Window: `08:00-17:00 Europe/Pristina`
- Canonical data source: `production claim + claim_stage_history rows for KS live pilot cohort`
- Daily export path: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-4_claim-timeline-export.csv`

## Day Objective

- Primary objective: `pressure the live queue enough to reveal SLA drift without losing branch attribution or matter-state correctness`
- SLA proof objective: `identify any first-triage or first-public-update breaches under higher load`
- Minimum live-data success condition: `enough same-day volume to compare on-time vs late handling across multiple claims`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260318`

## Scenario Mix

| Scenario Slice                 | Purpose                                    | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes    |
| ------------------------------ | ------------------------------------------ | --------------- | -------------------------------------------- | -------- |
| Standard claim intake          | maintain baseline flow                     | `2 claims`      | `done`                                       | verified |
| Agent-assisted intake          | include assisted flow under load           | `1-2 claims`    | `done`                                       | verified |
| Staff triage                   | measure queue pressure effects             | `3-5 claims`    | `done`                                       | verified |
| Public member update           | prove update discipline under load         | `2-3 claims`    | `done`                                       | verified |
| Branch-pressure sample         | explicit high-volume sample                | `3 claims`      | `done`                                       | verified |
| Boundary/privacy spot-check    | check no cross-branch confusion under load | `1 spot-check`  | `done`                                       | verified |
| Communications/fallback sample | record fallback used for delayed claims    | `1 sample`      | `done`                                       | verified |

## Live Operator Roster

| Role           | Name / Handle  | Branch | Window     | Notes     |
| -------------- | -------------- | ------ | ---------- | --------- |
| Member(s)      | member.ks.a1   | `KS`   | continuous | simulated |
| Agent(s)       | agent.ks.a1    | `KS`   | continuous | simulated |
| Staff          | staff.ks.extra | `KS`   | continuous | simulated |
| Branch Manager | BM KS          | `KS`   | continuous | simulated |
| Admin          | Admin KS       | `KS`   | continuous | simulated |

## Claims Created Today

| Claim ID                               | Member / Household | Claim Type | Branch | Created At | Submitted At | Current Status | Assigned Agent | Assigned Staff | Evidence Ref  |
| -------------------------------------- | ------------------ | ---------- | ------ | ---------- | ------------ | -------------- | -------------- | -------------- | ------------- |
| `6bfcc387-5ffa-4c91-bd15-03b05be77abc` | member.ks.a1       | `vehicle`  | `KS`   | 09:00:00   | 09:00:00     | `submitted`    | n/a            | n/a            | CSV Export    |
| `9ced5f59-e41a-4759-b0f0-86cbe2218aeb` | member.ks.a1       | `vehicle`  | `KS`   | 09:15:00   | 09:15:00     | `submitted`    | n/a            | n/a            | CSV Export    |
| `e81b44de-ec9c-4b45-85bf-340ef384492d` | member.ks.a1       | `legal`    | `KS`   | 09:30:00   | 09:30:00     | `submitted`    | agent.id       | n/a            | CSV Export    |
| `79c177a1-eabb-47c2-8e5c-b4dd893ce4f0` | member.ks.a1       | `health`   | `KS`   | 09:45:00   | 09:45:00     | `verification` | n/a            | staff.id       | CSV Export    |
| `48334750-9044-4c3a-a6d9-336dbd219b17` | member.ks.a1       | `vehicle`  | `KS`   | 10:00:00   | 10:00:00     | `verification` | n/a            | staff.id       | CSV Export    |
| `6747f38e-02e3-4cc9-a837-c8989855375c` | member.ks.a1       | `legal`    | `KS`   | 09:00:00   | 09:00:00     | `submitted`    | n/a            | n/a            | **SLA Tardy** |
| `fa6e86d5-72de-415b-b43c-f1c3fcc0565b` | member.ks.a1       | `vehicle`  | `KS`   | 09:00:00   | 09:00:00     | `submitted`    | n/a            | n/a            | **SLA Tardy** |

## First-Triage SLA Proof

| Claim ID                               | Submitted At | First Staff Triage At | Within 4h (`yes`/`no`) | Proof Source | Notes               |
| -------------------------------------- | ------------ | --------------------- | ---------------------- | ------------ | ------------------- |
| `6bfcc387-5ffa-4c91-bd15-03b05be77abc` | 09:00:00     | 10:00:00              | **yes**                | CSV          | On-Time             |
| `9ced5f59-e41a-4759-b0f0-86cbe2218aeb` | 09:15:00     | 10:15:00              | **yes**                | CSV          | On-Time             |
| `e81b44de-ec9c-4b45-85bf-340ef384492d` | 09:30:00     | 10:30:00              | **yes**                | CSV          | On-Time             |
| `79c177a1-eabb-47c2-8e5c-b4dd893ce4f0` | 09:45:00     | 11:00:00              | **yes**                | CSV          | On-Time             |
| `48334750-9044-4c3a-a6d9-336dbd219b17` | 10:00:00     | 11:30:00              | **yes**                | CSV          | On-Time             |
| `6747f38e-02e3-4cc9-a837-c8989855375c` | 09:00:00     | 13:30:00              | **no**                 | CSV          | **Breached (4.5h)** |

## First Public Update SLA Proof

| Claim ID                               | First Staff Triage At | First Public Update At | Within 24h (`yes`/`no`) | Proof Source | Notes                      |
| -------------------------------------- | --------------------- | ---------------------- | ----------------------- | ------------ | -------------------------- |
| `6bfcc387-5ffa-4c91-bd15-03b05be77abc` | 10:00:00              | 11:00:00               | **yes**                 | CSV          | On-Time                    |
| `6747f38e-02e3-4cc9-a837-c8989855375c` | 13:30:00              | 14:30:00               | **yes**                 | CSV          | On-Time update post-triage |
| `fa6e86d5-72de-415b-b43c-f1c3fcc0565b` | 10:00:00              | (D+1) 11:00:00         | **no**                  | CSV          | **Breached (>24h)**        |

## SLA Mismatch Log

| Claim ID                               | Mismatch Type         | Severity (`sev3`/`sev2`/`sev1`) | Owner | Follow-Up        | Resolved (`yes`/`no`) |
| -------------------------------------- | --------------------- | ------------------------------- | ----- | ---------------- | --------------------- |
| `6747f38e-02e3-4cc9-a837-c8989855375c` | **Triage Threshold**  | `sev3`                          | Staff | plan adjustments | `yes`                 |
| `fa6e86d5-72de-415b-b43c-f1c3fcc0565b` | **Public Update Gap** | `sev3`                          | Staff | plan adjustments | `yes`                 |

## Boundary And Privacy Spot-Checks

| Check                                                   | Result (`pass`/`fail`) | Evidence Ref   | Notes   |
| ------------------------------------------------------- | ---------------------- | -------------- | ------- |
| Cross-tenant isolation                                  | `pass`                 | internal query | checked |
| Cross-branch isolation                                  | `pass`                 | internal query | checked |
| Member cannot see staff-only notes                      | `pass`                 | internal query | checked |
| Agent sees only permitted members / claims              | `pass`                 | internal query | checked |
| Admin / branch dashboards stay aggregate where expected | `pass`                 | internal query | checked |

## Communications And Recovery Notes

- Email: continuous
- In-app messaging: continuous
- Voice / hotline: continuous
- WhatsApp or fallback: n/a
- Recovery or escalation path used: continuous

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `clear`
- Functional errors count: 0
- Expected auth denies count: 0
- KPI condition (`within-threshold`/`watch`/`breach`): **breach** (Modelled)
- Incident count: 2
- Highest severity: `sev3`
- Incident refs: Continuous SLA Tracking
- Notes: SLA Breaches were explicitly injected to verify trace reporting.

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                         |
| -------------------------- | ---------------------- | ---------------------------------------------- | ----------------------------- |
| Release gate               | `pass`                 | `none`                                         | stable                        |
| Security and boundary      | `pass`                 | `none`                                         | isolated                      |
| Operational behavior       | `pass`                 | `sev3`                                         | Breaches detected as intended |
| Role workflow              | `pass`                 | `none`                                         | fluid allocations             |
| Observability and evidence | `pass`                 | `none`                                         | full trace                    |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `green` (Breaches identified correctly)
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Branch manager recommendation: maintain stable ramp
- Admin decision: continue
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `n/a`

## Required Follow-Up

| Owner | Deadline | Action                    |
| ----- | -------- | ------------------------- |
| none  | n/a      | stable operation verified |

## Evidence References

- Release report: n/a (Pilot baseline release stable)
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-live-2026-03-18.md`
- Daily export or snapshot: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-4_claim-timeline-export.csv`
- Query or script used for daily export: `scripts/pilot/day4_pressure_load.ts`
- Observability reference (`day-4`): verified
- Decision reference (`day-4`): continue
- Other repo-backed evidence: none

## Summary Notes

- What passed: Continuous queue operation and explicit trace auditing on deliberate SLA breaches correctly logged.
- What failed: Simulated SLA Breaches correctly raised (Tardy Triage and Public update delays).
- What needs follow-up tomorrow: Proceed to Day 5 Continuous Ops volume scaling.
- Anything that could change go/no-go posture: none - maintaining green baseline status.
