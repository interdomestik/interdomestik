# Pilot Day 5 Daily Sheet

This file is the working-note layer only. The copied `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md` file remains the canonical pilot record.

After completing the sheet, write the canonical rows with:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 ...
```

## Live-Day Rule

Day 5 is a bounded same-day follow-up window after the day-4 Sev3 findings. It is not a new SLA cohort day. Its purpose is narrower: prove that the two day-4 Sev3 defects no longer reproduce on corrected production.

## Pilot Day Header

- Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`
- Day Number: `5`
- Date (`YYYY-MM-DD`): `2026-03-31`
- Scenario ID (`PD01`-`PD07`): `PD01`
- Scenario Name: `Sev3 Corrected-Baseline Follow-Up On Neutral-Host Production`
- Mode (`live`): `live`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `no`
- Admin Reviewer: `Admin KS`
- Shift Window (`HH:MM-HH:MM`, local timezone): `17:00-20:30 Europe/Pristina`
- Canonical data source: `production claim snapshot + deployment inspection + Resend API validation`
- Daily export path: `n/a`

## Day Objective

- Primary objective: `re-prove neutral-host KS branch attribution and production outbound-email credentials after the day-4 Sev3 findings`
- SLA proof objective: `show the corrected production claim path no longer reproduces empty branch attribution or Resend 401 credential failure`
- Minimum live-data success condition: `at least 1 real neutral-host tenant_ks claim persists with branch_id = ks_branch_a on corrected production, and the corrected production RESEND_API_KEY authenticates successfully against Resend`
- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260329`

## Scenario Mix

| Scenario Slice                 | Purpose                                           | Required Volume | Status (`planned`/`running`/`done`/`missed`) | Notes                                                                                     |
| ------------------------------ | ------------------------------------------------- | --------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Standard claim intake          | produce a real neutral-host control claim         | `1 claim`       | `done`                                       | `y1oCnny4os1NeetXmbPqD reproduced empty branch_id on the stale production deployment`     |
| Standard claim intake          | re-prove branch attribution after manual redeploy | `1 claim`       | `done`                                       | `roZ5n4nPbKzsIaxSoxZxe persisted with branch_id = ks_branch_a on dpl_JBv3...`             |
| Standard claim intake          | re-prove after Resend secret rotation             | `1 claim`       | `done`                                       | `K1GFsZVlumzqzwvw-R6vg persisted with branch_id = ks_branch_a on dpl_ANDSm...`            |
| Boundary/privacy spot-check    | carry forward latest explicit corrected proof     | `prior proof`   | `done`                                       | `day-2 PD05B rerun remains the latest explicit privacy / RBAC proof`                      |
| Communications/fallback sample | verify corrected production email credential path | `1 proof`       | `done`                                       | `corrected production RESEND_API_KEY matches valid key and GET /domains returns HTTP 200` |

## Claims Created Today

| Claim ID                | Member / Household | Claim Type | Branch        | Created At                 | Submitted At               | Current Status | Assigned Agent       | Assigned Staff | Evidence Ref                                                         |
| ----------------------- | ------------------ | ---------- | ------------- | -------------------------- | -------------------------- | -------------- | -------------------- | -------------- | -------------------------------------------------------------------- |
| `y1oCnny4os1NeetXmbPqD` | `neutral-host KS`  | `vehicle`  | `null`        | `2026-03-31 15:07:02 UTC`  | `2026-03-31 15:07:02 UTC`  | `submitted`    | `unknown`            | `n/a`          | `pre-deploy control on stale production build; defect still present` |
| `K1GFsZVlumzqzwvw-R6vg` | `neutral-host KS`  | `vehicle`  | `ks_branch_a` | `2026-03-31 16:09:11.448Z` | `2026-03-31 16:09:11.448Z` | `submitted`    | `golden_ks_agent_a1` | `n/a`          | `post-secret-rotation corrected production proof`                    |

Intermediate same-day proof claim `roZ5n4nPbKzsIaxSoxZxe` was created after manual deploy `dpl_JBv3QJu4zdbFWKjS4sov9H6vEDYx` and persisted with `tenant_id = tenant_ks`, `branch_id = ks_branch_a`, and `agent_id = golden_ks_agent_a1`. The working proof details are recorded in `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-5_claim-proof.md`.

## First-Triage SLA Proof

Target: first staff triage within `4 operating hours` of submission.

| Claim ID | Submitted At | First Staff Triage At | Within 4h (`yes`/`no`) | Proof Source | Notes                                                                                    |
| -------- | ------------ | --------------------- | ---------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `n/a`    | `n/a`        | `n/a`                 | `n/a`                  | `n/a`        | `this bounded follow-up window targeted write-path defects, not same-day triage cadence` |

## First Public Update SLA Proof

Target: first member-visible update within `24 operating hours` after triage.

| Claim ID | First Staff Triage At | First Public Update At | Within 24h (`yes`/`no`) | Proof Source | Notes                                                                        |
| -------- | --------------------- | ---------------------- | ----------------------- | ------------ | ---------------------------------------------------------------------------- |
| `n/a`    | `n/a`                 | `n/a`                  | `n/a`                   | `n/a`        | `this bounded follow-up window did not open a new public-update denominator` |

## SLA Mismatch Log

Use this section for anything that weakens proof, including late triage, late public updates, missing timeline rows, wrong branch attribution, or uncertainty in operating-hours math.

| Claim ID | Mismatch Type | Severity (`sev3`/`sev2`/`sev1`) | Owner | Follow-Up | Resolved (`yes`/`no`) |
| -------- | ------------- | ------------------------------- | ----- | --------- | --------------------- |

## Boundary And Privacy Spot-Checks

| Check                                      | Result (`pass`/`fail`) | Evidence Ref        | Notes                                                                                     |
| ------------------------------------------ | ---------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| Cross-tenant isolation                     | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green; no contrary signal observed`     |
| Cross-branch isolation                     | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green; branch attribution now restored` |
| Member cannot see staff-only notes         | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green`                                  |
| Agent sees only permitted members / claims | `pass`                 | `day-2 PD05B rerun` | `latest explicit corrected-baseline proof remains green`                                  |

## Communications And Recovery Notes

- Email: `production, preview, and development Vercel RESEND_API_KEY values were rotated to the valid key; corrected production key authenticates against Resend GET /domains with HTTP 200`
- In-app messaging: `n/a`
- Voice / hotline: `n/a`
- WhatsApp or fallback: `n/a`
- Recovery or escalation path used: `manual Vercel production deploy after blocked GitHub CD, then secret rotation and immediate live re-proof`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `clear`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `watch`
- Incident count: `0`
- Highest severity: `none`
- Incident refs: `none`
- Notes: `Day-5 follow-up cleared the two day-4 Sev3 defects on corrected production. Pre-deploy control claim y1oCnny4os1NeetXmbPqD still reproduced empty branch_id on the stale production deployment. After manual deploy dpl_JBv3QJu4zdbFWKjS4sov9H6vEDYx, claim roZ5n4nPbKzsIaxSoxZxe no longer reproduced that defect. Resend root cause was an invalid Vercel RESEND_API_KEY. The key was rewritten correctly in production, preview, and development, the corrected production key authenticated to Resend with HTTP 200, corrected production deploy dpl_ANDSmMZsQxp9og2bFF7JLmoKot7Q went live, and post-rotation claim K1GFsZVlumzqzwvw-R6vg persisted with tenant_ks, branch_id ks_branch_a, and agent_id golden_ks_agent_a1. This window clears the Sev3 items but does not create a new 2 Operating-Day Progression proof.`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                   |
| -------------------------- | ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Release gate               | `pass`                 | `none`                                         | `reuse corrected-baseline GO; same-day manual deploys only applied merged code and secret repair`       |
| Security and boundary      | `pass`                 | `none`                                         | `latest explicit PD05B corrected-baseline proof remains green`                                          |
| Operational behavior       | `pass`                 | `none`                                         | `neutral-host KS claim write path no longer reproduced empty branch attribution after corrected deploy` |
| Role workflow              | `pass`                 | `none`                                         | `claim persisted into tenant_ks with branch_id = ks_branch_a and agent_id = golden_ks_agent_a1`         |
| Observability and evidence | `pass`                 | `none`                                         | `Resend credential path is corrected and repo-backed; no fresh 401 reproduced in the watched proof run` |

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `amber`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Branch manager recommendation: `continue the bounded line; treat the Sev3 branch-attribution and Resend defects as corrected on the current production baseline`
- Admin decision: `continue`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `n/a`

## Required Follow-Up

| Owner                     | Deadline                       | Action                                                                                                        |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Platform Pilot Operator` | `next full operating day`      | `capture a fresh claim-bearing export with staff triage and public-update timing on the corrected baseline`   |
| `Platform Pilot Operator` | `before any expand discussion` | `prove that 2 Operating-Day Progression is no longer the weak point; this Sev3 follow-up alone is not enough` |

## Evidence References

- Release report: `docs/release-gates/2026-03-28_production_dpl_J4UNp8nDnxaVBaDSUzSc6umoFSfF.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-continuation-2026-03-28.md`
- Daily export or snapshot: `docs/pilot/live-data/pilot-ks-v1-0-0-continuation-2026-03-28_day-5_claim-proof.md`
- Query or script used for daily export: `n/a`
- Observability reference (`day-<n>`/`week-<n>`): `day-5`
- Decision reference (`day-<n>`/`week-<n>`): `day-5`
- Other repo-backed evidence: `production deployment ids dpl_GtFCDLYXGiZDyxueeqfckGFsLnMh, dpl_JBv3QJu4zdbFWKjS4sov9H6vEDYx, and dpl_ANDSmMZsQxp9og2bFF7JLmoKot7Q; proof claims y1oCnny4os1NeetXmbPqD, roZ5n4nPbKzsIaxSoxZxe, and K1GFsZVlumzqzwvw-R6vg`

## Summary Notes

- What passed: `post-deploy neutral-host claim writes now persist with KS branch attribution, and the corrected production Resend key authenticates successfully`
- What failed: `nothing new reproduced in the watched follow-up window`
- What needs follow-up tomorrow: `run a full corrected-baseline operating day with triage and public-update timing, not just write-path proof`
- Anything that could change go/no-go posture: `this follow-up clears two Sev3 blockers, but it does not change the known progression weakness and does not justify expand`
