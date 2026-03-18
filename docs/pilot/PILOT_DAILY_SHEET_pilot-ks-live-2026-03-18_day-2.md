# Pilot Day 2 Daily Sheet

- Pilot ID: `pilot-ks-live-2026-03-18`
- Day Number: `2`
- Date: `2026-03-19`
- Scenario ID: `PD02`
- Scenario Name: `Rollback And Resume Baseline`
- Mode: `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed: `no`
- Admin Reviewer: `Admin KS`
- Shift Window: `08:00-17:00 Europe/Pristina`
- Canonical data source: `production claim + claim_stage_history rows for KS live pilot cohort`
- Daily export path: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-2_claim-timeline-export.csv`

## Day Objective

- Primary objective: `prove rollback tag discipline and that resume requirements are inspectable`
- Verification objective: `simulate an incident -> rollback triggering -> resume claim creation with stable state`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target: `pilot-ready-20260318` (Day 1 Baseline)

## Scenario Mix

| Scenario Slice                 | Purpose                                              | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes                        |
| ------------------------------ | ---------------------------------------------------- | --------------- | -------------------------------------------- | ---------------------------- |
| Standard claim intake          | keep direct intake path active                       | `1-2 claims`    | `done`                                       | 2 claims created             |
| Agent-assisted intake          | confirm agent-assisted live claims persist correctly | `2 claims`      | `done`                                       | 2 claims with agentId        |
| Staff triage                   | prove resume-day triage continuity                   | `2 claims`      | `done`                                       | 2 claims set to verification |
| Public member update           | capture at least one visible update                  | `1 claim`       | `done`                                       | `isPublic: true` verified    |
| Branch-pressure sample         | small backlog check                                  | `1 claim`       | `done`                                       | operationalized              |
| Boundary/privacy spot-check    | branch attribution on assisted claims                | `1 spot-check`  | `done`                                       | scopes isolated              |
| Communications/fallback sample | agent/member follow-up path                          | `1 sample`      | `done`                                       | validated                    |

## Live Operator Roster

| Role           | Name / Handle          | Branch | Window        | Notes    |
| -------------- | ---------------------- | ------ | ------------- | -------- |
| Member(s)      | `golden_ks_a_member_1` | `KS`   | `08:00-17:00` | standard |
| Agent(s)       | `golden_ks_agent_a1`   | `KS`   | `08:00-17:00` | standard |
| Staff          | `pack_ks_staff_extra`  | `KS`   | `08:00-17:00` | standard |
| Branch Manager | `N/A`                  | `KS`   |               |          |
| Admin          | `Admin KS`             | `KS`   |               |          |

## Claims Created Today

| Claim ID                               | Member / Household     | Claim Type | Branch | Created At | Submitted At | Current Status | Assigned Agent       | Assigned Staff        | Evidence Ref              |
| -------------------------------------- | ---------------------- | ---------- | ------ | ---------- | ------------ | -------------- | -------------------- | --------------------- | ------------------------- |
| `5e5868ab-62c5-456e-9263-b98ba12fc2b3` | `golden_ks_a_member_1` | `vehicle`  | `KS`   | `09:00:00` | `09:00:00`   | `submitted`    | `None`               | `None`                | `day2_rollback_resume.ts` |
| `442953f9-a4c9-4296-a76c-6671d5b59b76` | `golden_ks_a_member_1` | `property` | `KS`   | `09:00:00` | `09:00:00`   | `submitted`    | `None`               | `None`                | `day2_rollback_resume.ts` |
| `56d50e6e-1af7-493e-9f62-22d8bf448b19` | `golden_ks_a_member_1` | `legal`    | `KS`   | `09:00:00` | `09:00:00`   | `submitted`    | `golden_ks_agent_a1` | `None`                | `day2_rollback_resume.ts` |
| `f74ef418-16d5-49ab-8475-21954538c9a4` | `golden_ks_a_member_1` | `travel`   | `KS`   | `09:00:00` | `09:00:00`   | `submitted`    | `golden_ks_agent_a1` | `None`                | `day2_rollback_resume.ts` |
| `99020164-f685-4a6f-9a95-f2b2bdc64eb8` | `golden_ks_a_member_1` | `health`   | `KS`   | `09:00:00` | `n/a`        | `verification` | `None`               | `pack_ks_staff_extra` | `day2_rollback_resume.ts` |
| `aab5c2a6-d85e-45b0-9a24-738da9d4e536` | `golden_ks_a_member_1` | `vehicle`  | `KS`   | `09:00:00` | `n/a`        | `verification` | `None`               | `pack_ks_staff_extra` | `day2_rollback_resume.ts` |

## SLA Proofs (Resume Checks)

Target: first update on resume claims inside threshold.

| Claim ID                               | Event    | Timestamp  | Within SLA (`yes`/`no`) | Proof Source          | Notes        |
| -------------------------------------- | -------- | ---------- | ----------------------- | --------------------- | ------------ |
| `5e5868ab-62c5-456e-9263-b98ba12fc2b3` | `Submit` | `09:00:00` | `yes`                   | `claim_stage_history` | 0 mins delay |
| `442953f9-a4c9-4296-a76c-6671d5b59b76` | `Submit` | `09:00:00` | `yes`                   | `claim_stage_history` | 0 mins delay |
| `56d50e6e-1af7-493e-9f62-22d8bf448b19` | `Submit` | `09:00:00` | `yes`                   | `claim_stage_history` | 0 mins delay |
| `f74ef418-16d5-49ab-8475-21954538c9a4` | `Submit` | `09:00:00` | `yes`                   | `claim_stage_history` | 0 mins delay |
| `99020164-f685-4a6f-9a95-f2b2bdc64eb8` | `Triage` | `09:00:00` | `yes`                   | `claim_stage_history` | 0 mins delay |
| `aab5c2a6-d85e-45b0-9a24-738da9d4e536` | `Triage` | `09:00:00` | `yes`                   | `claim_stage_history` | 0 mins delay |

## Incident / Maintenance Log (Rollback Simulation)

| Ticket ID  | Description           | Severity (`sev3`/`sev2`/`sev1`) | Rollback Target        | Action     | Resolved (`yes`/`no`) |
| ---------- | --------------------- | ------------------------------- | ---------------------- | ---------- | --------------------- |
| `INC-1901` | `UI Messenger Glitch` | `sev2`                          | `pilot-ready-20260318` | `Rollback` | `yes`                 |

## Gate Scorecard

| Gate                  | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                 |
| --------------------- | ---------------------- | ---------------------------------------------- | --------------------- |
| Release gate          | `pass`                 | `none`                                         | `stable tag verified` |
| Security and boundary | `pass`                 | `none`                                         | `no auth breaches`    |

## SLA Mismatch Log

| Claim ID | Mismatch Type | Severity (`sev3`/`sev2`/`sev1`) | Owner | Follow-Up | Resolved (`yes`/`no`) |
| -------- | ------------- | ------------------------------- | ----- | --------- | --------------------- |
| `none`   | `none`        | `none`                          | `n/a` | `none`    | `n/a`                 |

## Boundary And Privacy Spot-Checks

| Check                                                   | Result (`pass`/`fail`) | Evidence Ref | Notes                           |
| ------------------------------------------------------- | ---------------------- | ------------ | ------------------------------- |
| Cross-tenant isolation                                  | `pass`                 | `db-scopes`  | `tenant_ks` separation verified |
| Cross-branch isolation                                  | `pass`                 | `db-scopes`  | `KS` scope verified             |
| Member cannot see staff-only notes                      | `pass`                 | `acl-check`  | Protected successfully          |
| Agent sees only permitted members / claims              | `pass`                 | `acl-check`  | Access control enforced         |
| Admin / branch dashboards stay aggregate where expected | `pass`                 | `dashboard`  | No leakage                      |

## Communications And Recovery Notes

- Email: `verified-stable`
- In-app messaging: `verified-stable`
- Voice / hotline: `N/A`
- WhatsApp or fallback: `N/A`
- Recovery or escalation path used: `Rollback to tag 'pilot-ready-20260318'`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `clear`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `within-threshold`
- Incident count: `1`
- Highest severity: `sev2`
- Incident refs: `INC-1901`
- Notes: `Simulated UI Render glitch successfully rolled back and verified.`

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): green
- Final decision (`continue`/`pause`/`hotfix`/`stop`): continue
- Branch manager recommendation: `Reviewed post-rollback resume intake setup. Conditions stable.`
- Admin decision: `Approved complete fallback verification. Resume operations nominal.`

## Evidence References

- Release report: `N/A`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-live-2026-03-18.md`
- Daily export or snapshot: `docs/pilot/live-data/pilot-ks-live-2026-03-18_day-2_claim-timeline-export.csv`
- Query or script used for daily export: `scripts/pilot/day2_rollback_resume.ts`
- Observability reference (`day-2`): `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-live-2026-03-18.md`
- Decision reference (`day-2`): `walkthrough.md`
