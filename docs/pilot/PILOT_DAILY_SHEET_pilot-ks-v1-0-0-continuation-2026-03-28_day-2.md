# Pilot Day 2 Daily Sheet

This file is the working-note layer only. The copied `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` file remains the canonical pilot record.

After completing the sheet, write the canonical rows with:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
```

## Live-Day Rule

Day 2 is the first claim-bearing live-evidence day for this continuation line.

Every day must end with a repo-backed export or snapshot that proves:

- real claims were created that day
- real `claim_stage_history` rows exist for those claims
- first triage timing can be measured
- first public update timing can be measured

If that evidence is missing, the day is `blocked` in working notes and must not be carried into the canonical evidence index until fixed.

## Pilot Day Header

- Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`
- Day Number: `2`
- Date (`YYYY-MM-DD`): `2026-03-29`
- Scenario ID (`PD01`-`PD07`): `PD05B`
- Scenario Name: `Privacy / RBAC Corrected-Baseline Re-Proof And First Claim-Bearing Export`
- Mode (`live`): `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `no`
- Admin Reviewer: `Admin KS`
- Shift Window (`HH:MM-HH:MM`, local timezone): `08:00-17:00 Europe/Pristina`
- Canonical data source: `production claim + claim_stage_history rows for tenant_ks continuation cohort`
- Daily export path: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-2_claim-timeline-export.csv`

## Day Objective

- Primary objective: `re-prove privacy, RBAC, tenant isolation, and branch isolation on the corrected continuation baseline while capturing the first claim-bearing live export for the new pilot id`
- SLA proof objective: `produce a day-scoped canonical export with enough claim and timeline data to measure first triage and first public update timing`
- Minimum live-data success condition: `at least 1 real claim row for tenant_ks with at least 1 claim_stage_history row; otherwise mark the sheet blocked and do not write canonical day-2 evidence`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260329`

## Scenario Mix

| Scenario Slice                 | Purpose                                               | Required Volume     | Status (`planned`/`running`/`done`/`missed`) | Notes                                                               |
| ------------------------------ | ----------------------------------------------------- | ------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Standard claim intake          | establish day-scoped export denominator               | `1-3 claims`        | `planned`                                    | capture canonical claim ids and timestamps                          |
| Agent-assisted intake          | verify attribution holds under assisted entry         | `0-1 claim`         | `planned`                                    | optional if live traffic allows                                     |
| Staff triage                   | prove first triage timing is measurable               | `1-2 claims`        | `planned`                                    | required for SLA proof                                              |
| Public member update           | prove first public update timing is measurable        | `1 claim`           | `planned`                                    | required if a triaged claim exists early enough                     |
| Branch-pressure sample         | observe KS release surface under real load            | `0-1 branch sample` | `planned`                                    | keep bounded                                                        |
| Boundary/privacy spot-check    | execute `PD05B` route and isolation pass              | `1 pass`            | `planned`                                    | `/sq/member`, `/sq/agent`, `/sq/staff/claims`, `/sq/admin/overview` |
| Communications/fallback sample | confirm public-update and fallback path remain usable | `1 sample`          | `planned`                                    | record only if used                                                 |

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

| Check                                                   | Result (`pass`/`fail`) | Evidence Ref  | Notes                                                                                             |
| ------------------------------------------------------- | ---------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| Cross-tenant isolation                                  | `pass`                 | `PD05B rerun` | `golden-gate.spec.ts` tenant-isolation checks stayed green on the corrected continuation baseline |
| Cross-branch isolation                                  | `pass`                 | `PD05B rerun` | `golden-gate.spec.ts` branch-isolation checks stayed green on the corrected continuation baseline |
| Member cannot see staff-only notes                      | `pass`                 | `PD05B rerun` | `internal-notes-isolation.spec.ts` stayed green                                                   |
| Agent sees only permitted members / claims              | `pass`                 | `PD05B rerun` | `golden-gate.spec.ts` agent-scoping checks stayed green                                           |
| Admin / branch dashboards stay aggregate where expected | `pass`                 | `PD05B rerun` | `group-access-privacy-consent.spec.ts` stayed aggregate-only without explicit member consent      |

## Communications And Recovery Notes

- Email: `n/a`
- In-app messaging: `n/a`
- Voice / hotline: `n/a`
- WhatsApp or fallback: `n/a`
- Recovery or escalation path used: `none`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `expected-noise`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `within-threshold`
- Incident count: `0`
- Highest severity: `none`
- Incident refs: `none`
- Notes: `PD05B rerun passed on HEAD 9737e86c. Targeted gate slice covered member/admin isolation, tenant isolation, branch isolation, internal-note filtering, aggregate-only group privacy, and tenant-attribution preservation. Expected legacy-route 404 fallback noise appeared during negative-path coverage, but the suite stayed green. Do not write canonical day-2 evidence until the claim-bearing export exists.`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                      |
| -------------------------- | ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Release gate               | `pass`                 | `none`                                         | reuse corrected-baseline GO `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md` |
| Security and boundary      | `pass`                 | `none`                                         | `PD05B` targeted rerun green                                                                               |
| Operational behavior       | `pass`                 | `none`                                         | standalone artifact rebuilt on current HEAD and completed the targeted rerun cleanly                       |
| Role workflow              | `pass`                 | `none`                                         | canonical member, agent, staff, and admin route coverage stayed green                                      |
| Observability and evidence | `pass`                 | `none`                                         | privacy / RBAC proof captured; claim-bearing export still pending before day-close                         |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`):
- Final decision (`continue`/`pause`/`hotfix`/`stop`):
- Branch manager recommendation:
- Admin decision:
- Resume requires `pnpm pilot:check` (`yes`/`no`):
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`):
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`):

## Required Follow-Up

| Owner                     | Deadline                | Action                                                                                                                            |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Platform Pilot Operator` | `2026-03-29 end of day` | run the day-2 live export and save `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-2_claim-timeline-export.csv` |
| `Platform Pilot Operator` | `2026-03-29 end of day` | write canonical day-2 evidence only if the export proves real claim and timeline rows                                             |

## Evidence References

- Release report: `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md`
- Daily export or snapshot: `pending: docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-2_claim-timeline-export.csv`
- Query or script used for daily export: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-2_claim-timeline-export.sql`
- Observability reference (`day-<n>`/`week-<n>`): `pending canonical day-2 row`
- Decision reference (`day-<n>`/`week-<n>`): `pending canonical day-2 row`
- Other repo-backed evidence: `pnpm --filter @interdomestik/web test:e2e -- e2e/gate/golden-gate.spec.ts e2e/gate/group-access-privacy-consent.spec.ts e2e/gate/internal-notes-isolation.spec.ts e2e/gate/register-tenant-attribution.spec.ts --project=gate-ks-sq --workers=1 --max-failures=1 --trace=retain-on-failure --reporter=line`

## Summary Notes

- What passed: `PD05B` rerun stayed green on the corrected continuation baseline for tenant isolation, branch isolation, internal-note filtering, aggregate-only privacy, and tenant-attribution preservation.
- What failed: `nothing in the targeted rerun failed`
- What needs follow-up tomorrow: `complete the claim-bearing day-2 export, then write canonical day-2 evidence if the export is defensible`
- Anything that could change go/no-go posture: `the continuation line still has no claim-bearing export or SLA numerator/denominator proof for Day 2`
