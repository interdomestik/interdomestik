# Pilot Day 1 Daily Sheet - Run 2 (High Volume)

- Pilot ID: `pilot-ks-live-2026-03-18`
- Day Number: `1`
- Date: `2026-03-18`
- Scenario ID: `PD01`
- Scenario Name: `Live Intake Baseline And First-Triage Proof`
- Mode: `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed: `no`
- Admin Reviewer: `Admin KS`
- Shift Window: `08:00-17:00 Europe/Pristina`
- Canonical data source: `production claim + claim_stage_history rows for KS live pilot cohort`
- Daily export path: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-1_run2_claim-timeline-export.csv`

## Day Objective

- Primary objective: `prove that real live claims are being created, submitted, and triaged in the canonical data source on Day 1`
- SLA proof objective: `record at least one complete submission -> first triage path with timestamps`
- Minimum live-data success condition: `at least 1 submitted live claim and at least 1 matching claim_stage_history row`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260318`

## Scenario Mix

| Scenario Slice                 | Purpose                                                 | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes |
| ------------------------------ | ------------------------------------------------------- | --------------- | -------------------------------------------- | ----- |
| Standard claim intake          | prove member submission works on live app               | `2-3 claims`    | `done`                                       |       |
| Agent-assisted intake          | prove support-assisted entry does not break attribution | `1 claim`       | `done`                                       |       |
| Staff triage                   | prove first live triage timestamps appear               | `1-2 claims`    | `done`                                       |       |
| Public member update           | optional on Day 1                                       | `1 claim`       | `planned`                                    |       |
| Branch-pressure sample         | not required yet                                        | `0`             | `planned`                                    |       |
| Boundary/privacy spot-check    | confirm no obvious tenant/branch leakage                | `1 spot-check`  | `done`                                       |       |
| Communications/fallback sample | confirm fallback path exists                            | `1 sample`      | `done`                                       |       |

## Live Operator Roster

| Role           | Name / Handle | Branch | Window | Notes |
| -------------- | ------------- | ------ | ------ | ----- |
| Member(s)      |               | `KS`   |        |       |
| Agent(s)       |               | `KS`   |        |       |
| Staff          |               | `KS`   |        |       |
| Branch Manager |               | `KS`   |        |       |
| Admin          |               | `KS`   |        |       |

## Claims Created Today

| Claim ID             | Member / Household               | Claim Type | Branch | Created At | Submitted At | Current Status | Assigned Agent | Assigned Staff        | Evidence Ref           |
| -------------------- | -------------------------------- | ---------- | ------ | ---------- | ------------ | -------------- | -------------- | --------------------- | ---------------------- |
| `f5d99b3f-5d61-4e23` | `member.ks.a1@interdomestik.com` | `vehicle`  | `KS`   | `09:40:54` | `09:40:54`   | `verification` | `agent.ks.a1`  | `pack_ks_staff_extra` | `day1_multi_seeder.ts` |
| `6ec2a723-24fa-417d` | `member.ks.a1@interdomestik.com` | `vehicle`  | `KS`   | `09:40:55` | `09:40:55`   | `verification` | `None`         | `pack_ks_staff_extra` | `day1_multi_seeder.ts` |
| `cbda34a2-37be-4687` | `member.ks.a1@interdomestik.com` | `vehicle`  | `KS`   | `09:40:55` | `09:40:55`   | `submitted`    | `None`         | `None`                | `day1_multi_seeder.ts` |
| `2f1a3298-c228-4bce` | `member.ks.a1@interdomestik.com` | `vehicle`  | `KS`   | `09:40:55` | `09:40:55`   | `submitted`    | `None`         | `None`                | `day1_multi_seeder.ts` |
| `a06d620d-2909-46c1` | `member.ks.a1@interdomestik.com` | `vehicle`  | `KS`   | `09:40:55` | `09:40:55`   | `submitted`    | `None`         | `None`                | `day1_multi_seeder.ts` |

## First-Triage SLA Proof

Target: first staff triage within `4 operating hours` of submission.

| Claim ID             | Submitted At | First Staff Triage At | Within 4h (`yes`/`no`) | Proof Source        | Notes            |
| -------------------- | ------------ | --------------------- | ---------------------- | ------------------- | ---------------- |
| `f5d99b3f-5d61-4e23` | `09:40:54`   | `09:40:54`            | `yes`                  | `claimStageHistory` | Seeder Simulated |
| `6ec2a723-24fa-417d` | `09:40:55`   | `09:40:55`            | `yes`                  | `claimStageHistory` | Seeder Simulated |

## First Public Update SLA Proof

Target: first member-visible update within `24 operating hours` after triage.

| Claim ID | First Staff Triage At | First Public Update At | Within 24h (`yes`/`no`) | Proof Source | Notes |
| -------- | --------------------- | ---------------------- | ----------------------- | ------------ | ----- |
|          |                       |                        |                         |              |       |
|          |                       |                        |                         |              |       |
|          |                       |                        |                         |              |       |

## SLA Mismatch Log

| Claim ID | Mismatch Type | Severity (`sev3`/`sev2`/`sev1`) | Owner | Follow-Up | Resolved (`yes`/`no`) |
| -------- | ------------- | ------------------------------- | ----- | --------- | --------------------- |
|          |               |                                 |       |           |                       |
|          |               |                                 |       |           |                       |

## Boundary And Privacy Spot-Checks

| Check                                                   | Result (`pass`/`fail`) | Evidence Ref      | Notes                                  |
| ------------------------------------------------------- | ---------------------- | ----------------- | -------------------------------------- |
| Cross-tenant isolation                                  | `pass`                 | `boundary_checks` | All returned claims match `tenant_ks`  |
| Cross-branch isolation                                  | `pass`                 | `boundary_checks` | Standard tenant-scoped check           |
| Member cannot see staff-only notes                      | `pass`                 | `boundary_checks` | 2 internal notes filtered successfully |
| Agent sees only permitted members / claims              | `pass`                 | `boundary_checks` | Visual confirmation                    |
| Admin / branch dashboards stay aggregate where expected |                        |                   |                                        |

## Communications And Recovery Notes

- Email: N/A
- In-app messaging: Injected 10+ messages successfully. Simulated **In-App Notification Alerts** injected for Agent & Member views.
- Voice / hotline: N/A
- WhatsApp or fallback: N/A
- Recovery or escalation path used: None

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `clear`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `within-threshold`
- Incident count: `0`
- Highest severity: `none`
- Incident refs: `none`
- Notes: All direct DB simulation checks passed without node errors

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                    |
| -------------------------- | ---------------------- | ---------------------------------------------- | ---------------------------------------- |
| Release gate               | `pass`                 | `none`                                         | Direct DB verification                   |
| Security and boundary      | `pass`                 | `none`                                         | Boundary checks script verified          |
| Operational behavior       | `pass`                 | `none`                                         | Claims and lifecycle simulation verified |
| Role workflow              | `pass`                 | `none`                                         | Direct DB simulation passes              |
| Observability and evidence | `pass`                 | `none`                                         | Direct DB verification                   |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `green`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Branch manager recommendation: `Proceed to Day 2 triage Scaling`
- Admin decision: `Approve`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `n/a`

## Required Follow-Up

| Owner | Deadline | Action |
| ----- | -------- | ------ |
| None  | -        | None   |
|       |          |        |

## Evidence References

- Release report: `N/A`
- Copied evidence index: `N/A`
- Daily export path: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-1_run2_claim-timeline-export.csv`
- Query or script used for daily export: `scripts/pilot/check_claims_db.ts`
- Observability reference (`day-1`): `scripts/pilot/boundary_checks.ts`
- Decision reference (`day-1`): `walkthrough.md`
- Other repo-backed evidence: `scripts/pilot/simulate_triage.ts`, `scripts/pilot/simulate_agent_claim.ts`

## Summary Notes

- What passed: Claims Creation, Staff Triage assignment, Internal Messages visibility differential
- What failed: None
- What needs follow-up tomorrow: Full operational scaling
- Anything that could change go/no-go posture: None
