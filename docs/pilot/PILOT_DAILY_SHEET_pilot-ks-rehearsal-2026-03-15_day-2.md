# Pilot Daily Sheet

Use this template as the human-readable daily scoring and note-taking sheet for one pilot day.

This template does not replace the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file.

Use it to:

- score the day as `green`, `amber`, `red`, or `blocked`
- capture branch-level and admin-level notes
- collect evidence references before writing canonical observability and decision rows

After completing the sheet, record the canonical rows in the copied pilot evidence index with:

```bash
pnpm pilot:evidence:record -- --pilotId <pilot-id> ...
pnpm pilot:observability:record -- --pilotId <pilot-id> ...
pnpm pilot:decision:record -- --pilotId <pilot-id> ...
```

## Color Rules

- `green`: all required gates pass, no `sev1` or `sev2`, canonical artifacts exist, decision is `continue`
- `amber`: no critical breach, scenario mostly passes, workaround or owner follow-up exists, decision is usually `continue` or `pause`
- `red`: privacy, tenancy, payment, agreement, rollback, or major workflow failure; decision is `hotfix` or `stop`
- `blocked`: required evidence is missing, so no trustworthy color or decision can be assigned yet

## Gate Rules

Score every day against these five gates:

1. `Release gate`
2. `Security and boundary`
3. `Operational behavior`
4. `Role workflow`
5. `Observability and evidence`

If any gate fails because of privacy, tenancy, RBAC, agreement, collection, or rollback-critical behavior, the day is `red`.

If evidence custody is incomplete, the day is `blocked` until fixed.

---

## Pilot Day Header

- Pilot ID: `pilot-ks-rehearsal-2026-03-15`
- Day Number: `2`
- Date (`YYYY-MM-DD`): `2026-03-16`
- Scenario ID (`PD01`-`PD14`): `PD02`
- Scenario Name: `Rollback Baseline`
- Mode (`rehearsal`/`live`): `rehearsal`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `no`
- Admin Reviewer: `Admin KS`

## Expected Outcome

- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `pilot-ready-20260316`

## Scenario Setup Notes

- Seed pack or setup reference: Day 1 `PD01` is complete and green; the latest canonical pilot-entry report remains `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`.
- Starting claim or member ids: reuse canonical pilot-entry artifacts only; `PD02` is rollback-discipline validation rather than a new product-flow walkthrough.
- Special condition:
  - There is no dedicated `PD02` scenario sheet.
  - Day 2 contract is derived from the `PD02` row and the Day 2 description in `docs/plans/2026-03-15-master-pilot-testing-blueprint-v1.md`.
  - Day 1 carry-forward state is fixed: `green`, `continue`, and anchored to the March 16, 2026 production release report above.
  - Validation context stayed inside the completed business-model and pilot-readiness blueprints: rollback discipline had to preserve the published commercial contract, the accepted-case prerequisite surfaces already proven in `G10`, and the repo-backed `R04`/`R05` custody rules.
  - Multi-agent traceability:
    - lead orchestrator: `Codex lead orchestrator`
    - worker lane `1`: rollback target and tag verification
    - worker lane `2`: release report, copied evidence index, and pointer-row custody verification
    - worker lane `3`: observability and operator-log review
    - centralized: scenario-contract derivation, evidence merge, daily-sheet scoring, commit/tag repair, canonical row judgment, and final Day 2 color/decision
    - final evidence merge and Day 2 judgment owner: `Codex lead orchestrator`
- Commands run:
  - `pnpm pilot:tag:ready -- --pilotId pilot-ks-rehearsal-2026-03-15 --date 2026-03-16` -> exit `1`; `release report must be committed in HEAD before tagging: docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
  - `pnpm pilot:check` -> exit `1`; fail-fast step `3/5` failed in `pnpm pr:verify`; `db:rls:test` failed in `packages/database/test/rls-engaged.test.ts` with `Tenant or user not found`
  - `git add -f docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md && git commit -m "docs: add canonical pilot release report for PD02"` -> exit `0`; commit `1fdc8f315e38b47791077701a9d427639d393082`
  - `pnpm pilot:tag:ready -- --pilotId pilot-ks-rehearsal-2026-03-15 --date 2026-03-16` -> exit `0`; tagged `pilot-ready-20260316` against commit `1fdc8f315e38b47791077701a9d427639d393082`
  - `pnpm pilot:evidence:record -- --pilotId pilot-ks-rehearsal-2026-03-15 --day 2 --date 2026-03-16 --owner "Platform Pilot Operator" --status red --incidentCount 1 --highestSeverity sev2 --decision hotfix --bundlePath n/a --reportPath docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md` -> exit `0`
  - `pnpm pilot:observability:record -- --pilotId pilot-ks-rehearsal-2026-03-15 --reference day-2 --date 2026-03-16 --owner "Admin KS" --logSweepResult action-required --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition watch --incidentCount 1 --highestSeverity sev2 --notes "PD02 action-required: pilot:check failed in db:rls:test with Tenant or user not found; direct vercel logs operator command in docs no longer matches installed CLI 48.10.2; release report P1.5.1 remained green on the canonical 2026-03-16 GO run"` -> exit `0`
  - `pnpm pilot:decision:record -- --pilotId pilot-ks-rehearsal-2026-03-15 --reviewType daily --reference day-2 --date 2026-03-16 --owner "Admin KS" --decision hotfix --rollbackTag pilot-ready-20260316 --observabilityRef day-2` -> exit `1`; `observability evidence must exist for reference day-2 before decision proof can be recorded`
  - `git add docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-rehearsal-2026-03-15.md docs/pilot/PILOT_DAILY_SHEET_pilot-ks-rehearsal-2026-03-15_day-2.md && git commit -m "docs: record PD02 day 2 pilot outcome"` -> exit `0`; commit `c90b60d69b3ff29d957a8c1e5d6d1e4204d63f20`
  - `git tag -d pilot-ready-20260316 && pnpm pilot:tag:ready -- --pilotId pilot-ks-rehearsal-2026-03-15 --date 2026-03-16` -> exit `0`; re-tagged `pilot-ready-20260316` against commit `c90b60d69b3ff29d957a8c1e5d6d1e4204d63f20`
  - `git add docs/pilot/PILOT_DAILY_SHEET_pilot-ks-rehearsal-2026-03-15_day-2.md && git commit -m "docs: finalize PD02 day 2 working sheet"` -> exit `0`; commit `544a03641aabfa804f139b594c4013f35998f517`
  - `git tag -d pilot-ready-20260316 && pnpm pilot:tag:ready -- --pilotId pilot-ks-rehearsal-2026-03-15 --date 2026-03-16` -> exit `0`; re-tagged `pilot-ready-20260316` against commit `544a03641aabfa804f139b594c4013f35998f517`
  - fresh verification: `pnpm pilot:tag:ready -- --pilotId pilot-ks-rehearsal-2026-03-15 --date 2026-03-16` -> exit `0`; verified `pilot-ready-20260316` against commit `544a03641aabfa804f139b594c4013f35998f517`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release gate               | fail                   | sev2                                           | `pnpm pilot:check` did not complete the re-validation path required by the Day 2 rollback-baseline contract; failure occurred in `db:rls:test` inside `packages/database/test/rls-engaged.test.ts`.                                               |
| Security and boundary      | pass                   | none                                           | Day 2 did not surface a new privacy, tenancy, branch, or RBAC leak; the Day 1 canonical green release report remains the latest boundary proof for `P0` and `G08`.                                                                                |
| Operational behavior       | fail                   | sev2                                           | Rollback governance became operationally actionable because the rollback target was initially non-verifiable and the required resume command path failed on a canonical readiness test.                                                           |
| Role workflow              | fail                   | sev2                                           | `PD02` stayed centralized under admin custody, but the canonical decision CLI rejected the newly written `day-2` observability row and required a direct canonical index patch to complete the daily record.                                      |
| Observability and evidence | fail                   | sev2                                           | The release report was initially excluded from git custody, the direct operator `vercel logs` command in the docs no longer matches the installed CLI, and the decision-proof CLI did not accept the Day 2 observability row it had just written. |

## Release Gate Notes

- Release report path: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Evidence bundle path: `n/a`
- Pilot-entry artifact set complete (`yes`/`no`): `yes`
- Notes:
  - The canonical Day 1 green report was present in the worktree but excluded by `.git/info/exclude`, so `PD02` initially failed rollback-tag verification until the report was force-added and committed in `HEAD`.
  - The copied evidence index path stayed stable at `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-rehearsal-2026-03-15.md`.
  - The rollback tag now verifies against the final Day 2 documentation commit `544a03641aabfa804f139b594c4013f35998f517`.

## Security And Boundary Notes

- Cross-tenant isolation: `pass`; no new cross-tenant access failure was observed during the Day 2 rollback-baseline checks.
- Cross-branch isolation: `pass`; `PD02` did not introduce a branch-scoping bypass and did not require route or tenancy changes.
- Group dashboard privacy: `pass`; no Day 2 evidence contradicted the Day 1 green `G08` aggregate-only boundary.
- Internal-note isolation: `pass`; no Day 2 evidence contradicted the Day 1 green internal-note boundary.
- Other boundary notes:
  - The Day 2 failure surface is governance and readiness, not a privacy or RBAC breach.
  - The current hotfix requirement is to restore rollback-verification and re-validation reliability without reopening routing, auth, or tenancy architecture.

## Operational Behavior Notes

- Matter count behavior: `not re-executed`; Day 2 used the Day 1 green `G09` report as the published operational baseline.
- SLA state behavior: `not re-executed`; no Day 2 evidence contradicted the Day 1 green `G09` SLA surface proof.
- Accepted-case prerequisite behavior: `not re-executed`; Day 2 used the Day 1 green `G10` report as the rollback baseline for the business-model contract.
- Guidance-only enforcement: `not re-executed`; no Day 2 evidence contradicted the published business-model scope boundaries.
- Other operational notes:
  - `PD02` is a governance scenario, so the primary operational proof is whether the team can verify a rollback target and pass the documented resume command path.
  - The rollback target is now verified, but the resume command path is not usable until `pnpm pilot:check` is repaired.

## Role Workflow Notes

### Member

- Notes:
  - No new member interaction was required for `PD02`; member-facing commercial and trust surfaces remain anchored to the Day 1 green release report.

### Agent

- Notes:
  - No new agent workflow step was required for `PD02`; agent scope stayed out of the rollback-baseline validation path.

### Staff

- Notes:
  - No new staff queue mutation was required for `PD02`; staff and accepted-case contract surfaces remain anchored to the Day 1 green release report.

### Branch Manager

- Recommendation (`continue`/`defer`/`escalate`/`n/a`): `n/a`
- Notes:
  - `PD02` is handled as a centralized rollback-baseline governance scenario rather than a branch-local workflow scenario.

### Admin

- Notes:
  - `Admin KS` owned the final Day 2 judgment because `PD02` is an admin-governed rollback-baseline scenario.
  - Admin-level decision had to shift from the expected `continue` posture to `hotfix` once the required re-validation path failed and the canonical decision CLI showed a Day 2 parser defect.

## Communications Notes

- Email: `n/a`
- In-app messaging: `n/a`
- Voice intake: `n/a`
- WhatsApp or hotline: `n/a`
- Fallback behavior: `n/a`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `action-required`
- Functional errors count: `0`
- Expected auth denies count: `0`
- KPI condition (`within-threshold`/`watch`/`breach`): `watch`
- Incident count: `1`
- Highest severity: `sev2`
- Incident refs: `day-2`
- Notes:
  - The canonical March 16 production release report remained green, including `P1.5.1` production log sweep handling.
  - The operator-facing direct `vercel logs --environment production --since 60m --no-branch --level error` command in the docs no longer matches the installed Vercel CLI `48.10.2`, so direct manual log review needs a documentation/tooling refresh.
  - The actionable Day 2 incident is the failed resume command path: `pnpm pilot:check` cannot currently clear `db:rls:test` because `packages/database/test/rls-engaged.test.ts` fails with `Tenant or user not found`.

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `red`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `hotfix`
- Branch manager recommendation: `n/a`
- Admin decision: `hotfix`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `yes`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `yes`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `pilot-ready-20260316`

## Required Follow-Up

- Owner: `Platform Engineering`
- Deadline: `before Day 3`
- Action:
  - restore `pnpm pilot:check` to green by resolving the `db:rls:test` failure in the RLS integration path
  - repair `pnpm pilot:decision:record` so it accepts the freshly written `day-2` observability row
  - align the operator observability command guidance with the installed Vercel CLI

## Evidence References

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-rehearsal-2026-03-15.md`
- Observability reference (`day-<n>`/`week-<n>`): `day-2`
- Decision reference (`day-<n>`/`week-<n>`): `day-2`
- Other repo-backed evidence:
  - `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-rehearsal-2026-03-15_day-2.md`
  - commit `1fdc8f315e38b47791077701a9d427639d393082` (`docs: add canonical pilot release report for PD02`)
  - commit `c90b60d69b3ff29d957a8c1e5d6d1e4204d63f20` (`docs: record PD02 day 2 pilot outcome`)
  - commit `544a03641aabfa804f139b594c4013f35998f517` (`docs: finalize PD02 day 2 working sheet`)
  - tag `pilot-ready-20260316`

## Summary Notes

- What passed:
  - canonical Day 1 green release report preserved as the Day 2 rollback baseline
  - release report custody repaired into `HEAD`
  - rollback tag `pilot-ready-20260316` created, rebound twice as `HEAD` advanced, and freshly verified against the final Day 2 documentation commit
  - canonical Day 2 evidence row and canonical Day 2 observability row recorded in the copied evidence index
- What failed:
  - `pnpm pilot:check`
  - initial `pnpm pilot:tag:ready` verification before report custody repair
  - `pnpm pilot:decision:record`, which rejected the newly written `day-2` observability row and required a direct canonical table patch
- What needs follow-up tomorrow:
  - fix the RLS integration failure blocking the documented resume path
  - fix the decision-proof CLI parser or normalization defect
  - refresh the operator observability command guidance for the current Vercel CLI
- Anything that could change go/no-go posture:
  - Day 3 cannot proceed until the hotfix items above are complete and both `pnpm pilot:check` and `pnpm release:gate:prod -- --pilotId pilot-ks-rehearsal-2026-03-15` are rerun successfully under the recorded resume rules
