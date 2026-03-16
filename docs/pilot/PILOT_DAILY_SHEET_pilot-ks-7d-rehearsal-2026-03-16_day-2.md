# Pilot Day 2 Daily Sheet

- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Day Number: `2`
- Date: `2026-03-16`
- Scenario ID: `PD02`
- Scenario Name: `Rollback And Resume Baseline`
- Mode: `rehearsal`
- Tenant: `all`
- Branch: `n/a`
- Owner: `platform`
- Branch Manager Reviewed: `no`
- Admin Reviewer: `platform`

> Replay note: `PD02` is an intentional same-date control replay on `2026-03-16`, not a new calendar day. The rollback tag stays `pilot-ready-20260316` because it is bound to the pilot-entry artifact date already recorded for this pilot id.

## Orchestration Traceability

- Lead orchestrator: `platform`
- Worker lanes used: `none`
- Worker lane scopes: `n/a`
- What remained centralized: `rollback-tag verification, pilot-check execution, evidence merge, and final daily judgment`
- Evidence merged by: `platform`
- Final daily judgment made by: `platform`
- `Single-orchestrator run`: `yes`
- If yes, why: `PD02 is a bounded rollback-and-resume control check on one pilot id and does not require parallel operator lanes.`

## Expected Outcome

- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260316`
- Calendar-date note: `PD02` intentionally reuses the Day 1 calendar date so rollback and resume verification stays bound to the same pilot-entry artifacts created on `2026-03-16`.

## Scenario Setup Notes

- Seed pack or setup reference: `continuation from PD01 on the same pilot id after merged P8R/SP01 canon`
- Starting claim or member ids: `n/a`
- Special condition: `prove rollback tag discipline and decision-proof linkage without reopening the old 14-day pilot`
- Commands run:
  - `pnpm memory:retrieve --query docs/pilot/memory/p8-rg01-memory-query.json --out tmp/pilot-memory/p8-rg01-pd02-retrieval.json` -> exit `0`; top hit `mem_824e576a3e5d46a0` (`pilot.reset_gate.check_failure`) score `10`
  - `pnpm memory:retrieve --query docs/pilot/memory/p8-rg03-memory-query.json --out tmp/pilot-memory/p8-rg03-pd02-retrieval.json` -> exit `0`; top hit `mem_fe914e87a2013487` (`pilot.decision.observability_gap`) score `10`
  - `pnpm pilot:tag:ready -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --date 2026-03-16` -> exit `1`; existing local tag still pointed at pre-merge commit `f746d5663caf249377051ed445abf92c75024c2b` while `HEAD` was `fc29e3ff21ad1b39782ab8718844d49c7f6bceab`
  - `NODE20_BIN="$(dirname "$(npx -y node@20 -p 'process.execPath')")"; PATH="$NODE20_BIN:$PATH" pnpm pilot:check` -> exit `0`; full verification pack passed end-to-end
  - `git tag -d pilot-ready-20260316 && pnpm pilot:tag:ready -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --date 2026-03-16` -> exit `0`; rebound `pilot-ready-20260316` to `HEAD`
  - `pnpm pilot:evidence:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --day 2 --date 2026-03-16 --owner platform --status green --reportPath docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md --bundlePath n/a --incidentCount 0 --highestSeverity none --decision continue` -> exit `0`
  - `pnpm pilot:observability:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reference day-2 --date 2026-03-16 --owner platform --logSweepResult expected-noise --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes "pilot:check passed; stale rollback tag corrected locally after merge advanced HEAD"` -> exit `0`
  - `pnpm pilot:decision:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reviewType daily --reference day-2 --date 2026-03-16 --owner platform --decision continue --rollbackTag pilot-ready-20260316 --observabilityRef day-2` -> exit `0`
  - fresh verification: `pnpm pilot:tag:ready -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --date 2026-03-16` -> exit `0`; verified tag against commit `fc29e3ff21ad1b39782ab8718844d49c7f6bceab`

## Gate Scorecard

| Gate                       | Result | Highest severity | Notes                                                                                                                                                                                           |
| -------------------------- | ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release gate               | pass   | none             | Canonical report path and copied evidence index were present in `HEAD`; the stale local rollback tag was corrected and freshly verified against the same committed Day 1 pilot-entry artifacts. |
| Security and boundary      | pass   | none             | No tenant, branch, privacy, or note-isolation regression appeared during the Day 2 control run.                                                                                                 |
| Operational behavior       | pass   | none             | `pilot:check` completed successfully across `pr:verify`, `security:guard`, and the full gate/e2e pack, so the resume baseline remained stable after the merge.                                  |
| Role workflow              | pass   | none             | `PD02` is a platform-owned control run; the decision CLI successfully linked the Day 2 observability row and rollback target without manual repair.                                             |
| Observability and evidence | pass   | none             | Memory top-hit checks passed, observability was recorded before decision proof, and the copied evidence index now holds the full Day 2 row set.                                                 |

## Release Gate Notes

- Release report path: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Evidence bundle path: `n/a`
- Pilot-entry artifact set complete (`yes`/`no`): `yes`
- Notes:
  - No fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` run was required for Day 2 because the day ended `continue`, not `pause`, `hotfix`, or `stop`.
  - The only release-governance issue was the stale local `pilot-ready-20260316` tag left behind after `main` advanced; retagging restored alignment with the committed Day 1 pilot-entry artifacts.

## Security And Boundary Notes

- Cross-tenant isolation: `pass`; no cross-tenant access regression surfaced during `pilot:check`.
- Cross-branch isolation: `pass`; no branch-scoping regression surfaced during `pilot:check`.
- Group dashboard privacy: `pass`; Day 2 did not contradict the established aggregate-only dashboard rule.
- Internal-note isolation: `pass`; Day 2 did not surface any member-visible leak of staff-only note history.
- Other boundary notes:
  - The Day 2 issue was local rollback-tag hygiene after merge advancement, not a product boundary failure.

## Operational Behavior Notes

- Matter count behavior: `not directly exercised`; no regression surfaced in the gate suite.
- SLA state behavior: `not directly exercised`; no regression surfaced in the gate suite.
- Accepted-case prerequisite behavior: `pass`; accepted-recovery prerequisite gates passed inside `pilot:check`.
- Guidance-only enforcement: `not directly exercised in this control run`; no regression surfaced in the gate suite.
- Other operational notes:
  - `pilot:check` passed end-to-end after the merge, which confirms the reset-gate hardening remained stable on the canonical `PD02` branch.

## Role Workflow Notes

### Member

- Notes:
  - No direct member operator action was required beyond what the gate suites exercised.

### Agent

- Notes:
  - No direct agent operator action was required beyond what the gate suites exercised.

### Staff

- Notes:
  - No direct staff operator action was required beyond what the gate suites exercised.

### Branch Manager

- Recommendation (`continue`/`defer`/`escalate`/`n/a`): `n/a`
- Notes:
  - `PD02` is a rollback-and-resume governance check, not a branch-ops scenario.

### Admin

- Notes:
  - Admin decision custody was exercised through the canonical decision proof flow, not a separate UI workflow.

## Communications Notes

- Email: `n/a`
- In-app messaging: `n/a`
- Voice intake: `n/a`
- WhatsApp or hotline: `n/a`
- Fallback behavior: `n/a`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `expected-noise`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `within-threshold`
- Incident count: `0`
- Highest severity: `none`
- Incident refs: `n/a`
- Notes:
  - The required memory retrievals were satisfied with the intended trigger as the top hit in both cases.
  - The stale local rollback tag was corrected before the final decision row was written.

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `green`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Executive recommendation if this is `PD07` (`expand`/`repeat_with_fixes`/`pause`/`stop`/`n/a`): `n/a`
- Branch manager recommendation: `n/a`
- Admin decision: `continue`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `pilot-ready-20260316`

## Required Follow-Up

- Owner: `platform`
- Deadline: `before SP03`
- Action: `Commit the Day 2 artifacts and keep the rollback tag aligned when future pilot-day docs advance HEAD.`

## Evidence References

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Memory advisory retrieval: `tmp/pilot-memory/p8-rg01-pd02-retrieval.json`, `tmp/pilot-memory/p8-rg03-pd02-retrieval.json`
- Observability reference (`day-<n>`/`week-<n>`): `day-2`
- Decision reference (`day-<n>`/`week-<n>`): `day-2`
- Other repo-backed evidence: `docs/plans/2026-03-16-sp02-pd02-rollback-and-resume-baseline-proof.md`

## Summary Notes

- What passed:
  - Memory top-hit checks
  - full `pnpm pilot:check`
  - rollback-tag rebind and verification
  - evidence, observability, and decision recording
- What failed:
  - The first Day 2 `pilot:tag:ready` attempt failed because the local tag still pointed at the pre-merge commit.
- What needs follow-up tomorrow:
  - None required to proceed to `SP03`; only keep tag alignment in mind when committing future pilot-day docs.
- Anything that could change go/no-go posture:
  - No. After retagging, Day 2 closed `green / continue`.
