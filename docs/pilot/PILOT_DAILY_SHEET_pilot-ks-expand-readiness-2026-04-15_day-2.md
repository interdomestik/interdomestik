# Pilot Daily Sheet Live Template

Use this template for a controlled live pilot day when real member activity must produce canonical claim and timeline evidence.

This template is stricter than the rehearsal template. It adds required live-data custody fields so Day 7 can prove SLA behavior from real claims instead of seeded packs.

This file is the working-note layer only. The copied `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-expand-readiness-2026-04-15.md` file remains the canonical pilot record.

After completing the sheet, write the canonical rows with:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-expand-readiness-2026-04-15 ...
pnpm pilot:observability:record -- --pilotId pilot-ks-expand-readiness-2026-04-15 ...
pnpm pilot:decision:record -- --pilotId pilot-ks-expand-readiness-2026-04-15 ...
```

## Live-Day Rule

Every day must end with a repo-backed export or snapshot that proves:

- real claims were created that day
- real `claim_stage_history` rows exist for those claims
- first triage timing can be measured
- first public update timing can be measured

If that evidence is missing, the day is `blocked` in working notes and must not be carried into the canonical evidence index until fixed.

## Pilot Day Header

- Pilot ID:
- Day Number:
- Date (`YYYY-MM-DD`):
- Scenario ID (`PD01`-`PD07`):
- Scenario Name:
- Mode (`live`):
- Tenant:
- Branch:
- Owner:
- Branch Manager Reviewed (`yes`/`no`):
- Admin Reviewer:
- Shift Window (`HH:MM-HH:MM`, local timezone):
- Canonical data source:
- Daily export path:

## Day Objective

- Primary objective:
- SLA proof objective:
- Minimum live-data success condition:
- Expected color:
- Expected decision:
- Rollback target if applicable:

## Scenario Mix

| Scenario Slice                 | Purpose | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes |
| ------------------------------ | ------- | --------------- | -------------------------------------------- | ----- |
| Standard claim intake          |         |                 |                                              |       |
| Agent-assisted intake          |         |                 |                                              |       |
| Staff triage                   |         |                 |                                              |       |
| Public member update           |         |                 |                                              |       |
| Branch-pressure sample         |         |                 |                                              |       |
| Boundary/privacy spot-check    |         |                 |                                              |       |
| Communications/fallback sample |         |                 |                                              |       |

## Live Operator Roster

| Role           | Name / Handle | Branch | Window | Notes |
| -------------- | ------------- | ------ | ------ | ----- |
| Member(s)      |               |        |        |       |
| Agent(s)       |               |        |        |       |
| Staff          |               |        |        |       |
| Branch Manager |               |        |        |       |
| Admin          |               |        |        |       |

## Claims Created Today

| Claim ID | Member / Household | Claim Type | Branch | Created At | Submitted At | Current Status | Assigned Agent | Assigned Staff | Evidence Ref |
| -------- | ------------------ | ---------- | ------ | ---------- | ------------ | -------------- | -------------- | -------------- | ------------ |
|          |                    |            |        |            |              |                |                |                |              |
|          |                    |            |        |            |              |                |                |                |              |
|          |                    |            |        |            |              |                |                |                |              |
|          |                    |            |        |            |              |                |                |                |              |
|          |                    |            |        |            |              |                |                |                |              |

## First-Triage SLA Proof

Target: first staff triage within `4 operating hours` of submission.

| Claim ID | Submitted At | First Staff Triage At | Within 4h (`yes`/`no`) | Proof Source | Notes |
| -------- | ------------ | --------------------- | ---------------------- | ------------ | ----- |
|          |              |                       |                        |              |       |
|          |              |                       |                        |              |       |
|          |              |                       |                        |              |       |
|          |              |                       |                        |              |       |
|          |              |                       |                        |              |       |

## First Public Update SLA Proof

Target: first member-visible update within `24 operating hours` after triage.

| Claim ID | First Staff Triage At | First Public Update At | Within 24h (`yes`/`no`) | Proof Source | Notes |
| -------- | --------------------- | ---------------------- | ----------------------- | ------------ | ----- |
|          |                       |                        |                         |              |       |
|          |                       |                        |                         |              |       |
|          |                       |                        |                         |              |       |
|          |                       |                        |                         |              |       |
|          |                       |                        |                         |              |       |

## SLA Mismatch Log

Use this section for anything that weakens proof, including late triage, late public updates, missing timeline rows, wrong branch attribution, or uncertainty in operating-hours math.

| Claim ID | Mismatch Type | Severity (`sev3`/`sev2`/`sev1`) | Owner | Follow-Up | Resolved (`yes`/`no`) |
| -------- | ------------- | ------------------------------- | ----- | --------- | --------------------- |
|          |               |                                 |       |           |                       |
|          |               |                                 |       |           |                       |
|          |               |                                 |       |           |                       |

## Boundary And Privacy Spot-Checks

| Check                                                   | Result (`pass`/`fail`) | Evidence Ref | Notes |
| ------------------------------------------------------- | ---------------------- | ------------ | ----- |
| Cross-tenant isolation                                  |                        |              |       |
| Cross-branch isolation                                  |                        |              |       |
| Member cannot see staff-only notes                      |                        |              |       |
| Agent sees only permitted members / claims              |                        |              |       |
| Admin / branch dashboards stay aggregate where expected |                        |              |       |

## Communications And Recovery Notes

- Email:
- In-app messaging:
- Voice / hotline:
- WhatsApp or fallback:
- Recovery or escalation path used:

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`):
- Functional errors count:
- Expected auth denies count:
- KPI condition (`within-threshold`/`watch`/`breach`):
- Incident count:
- Highest severity:
- Incident refs:
- Notes:

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes |
| -------------------------- | ---------------------- | ---------------------------------------------- | ----- |
| Release gate               |                        |                                                |       |
| Security and boundary      |                        |                                                |       |
| Operational behavior       |                        |                                                |       |
| Role workflow              |                        |                                                |       |
| Observability and evidence |                        |                                                |       |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`):
- Final decision (`continue`/`pause`/`hotfix`/`stop`):
- Branch manager recommendation:
- Admin decision:
- Resume requires `pnpm pilot:check` (`yes`/`no`):
- Resume requires fresh `pnpm release:gate:prod -- --pilotId pilot-ks-expand-readiness-2026-04-15` (`yes`/`no`):
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`):

## Required Follow-Up

| Owner | Deadline | Action |
| ----- | -------- | ------ |
|       |          |        |
|       |          |        |

## Evidence References

- Release report:
- Copied evidence index:
- Daily export or snapshot:
- Query or script used for daily export:
- Observability reference (`day-<n>`/`week-<n>`):
- Decision reference (`day-<n>`/`week-<n>`):
- Other repo-backed evidence:

## Summary Notes

- What passed:
- What failed:
- What needs follow-up tomorrow:
- Anything that could change go/no-go posture:
