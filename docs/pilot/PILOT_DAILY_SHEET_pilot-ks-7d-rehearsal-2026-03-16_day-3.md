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

- Pilot ID: `pilot-ks-7d-rehearsal-2026-03-16`
- Day Number: `3`
- Date (`YYYY-MM-DD`): `2026-03-16`
- Scenario ID (`PD01`-`PD07`): `PD03`
- Scenario Name: `Closed-Loop Role Flow`
- Mode (`rehearsal`/`live`): `rehearsal`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `yes`
- Admin Reviewer: `Admin KS`

## Orchestration Traceability

- Lead orchestrator: `Codex lead orchestrator`
- Worker lanes used: `2`
- Worker lane scopes:
  - `Ohm`: isolate the minimal Day 3 blockers in pilot ceremony auth, cookie-consent interaction, and pilot fixture coverage
  - `Lagrange`: isolate the branch-dashboard route issue and confirm whether member-diaspora remained a primary blocker
- What remained centralized:
  - final scenario ownership
  - code changes
  - fresh verification execution
  - evidence merge
  - daily-sheet scoring
  - canonical row recording
  - final Day 3 judgment
- Evidence merged by: `Codex lead orchestrator`
- Final daily judgment made by: `Codex lead orchestrator`
- `Single-orchestrator run` (`yes`/`no`): `no`
- If yes, why: `n/a`

## Expected Outcome

- Active scenario: `PD03`
- Exact Day 3 objective derived from the scenario sheet:
  - prove the closed loop `member -> agent -> staff -> branch_manager -> admin` on fresh pilot evidence
  - complete Day 3 only
  - leave routing, auth, tenancy, and `apps/web/src/proxy.ts` untouched
- Expected artifacts from Day 3:
  - updated Day 3 daily sheet
  - canonical Day 3 evidence row
  - canonical Day 3 observability row
  - canonical Day 3 decision row
- Parallel work used:
  - independent failure-isolation lanes only
- Centralized work:
  - all live command execution
  - all artifact updates
  - final color and go/no-go judgment
- Rollback target if applicable: `pilot-ready-20260316`

## Scenario Setup Notes

- Seed pack or setup reference:
  - validated carry-forward state:
    - `SP01 / PD01` complete: `green / continue`
    - `SP02 / PD02` complete: `green / continue`
    - rollback tag verified: `pilot-ready-20260316`
  - scenario sheet: `docs/pilot/scenarios/PD03-closed-loop-role-flow.md`
  - copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Starting proof path:
  - member claim creation and handoff proof: `apps/web/e2e/pilot/c1-01-pilot-ceremony-closed-loop.spec.ts`
  - branch-manager proof: `apps/web/e2e/branch-dashboard.spec.ts`
  - admin proof: `apps/web/e2e/admin-overview.spec.ts`
- Special condition:
  - the first Day 3 rerun had already recorded a red state
  - this repair pass reran the proof after fixing the concrete blockers and replaced the canonical Day 3 result with the fresh green outcome
- Commands run:
  - `pnpm --filter @interdomestik/web exec vitest run src/lib/tenant/tenant-hosts.test.ts 'src/app/api/auth/[...all]/_core.test.ts'` -> exit `0`; `43` tests passed across `2` files
  - `set -a; source .env.local; set +a; pnpm --filter @interdomestik/web run build:ci` -> exit `0`
  - `set -a; source .env.local; set +a; pnpm --filter @interdomestik/database run seed:golden -- --reset` -> exit `0`
  - `PW_REUSE_SERVER=1 NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/branch-dashboard.spec.ts --project=ks-sq --project=mk-mk --workers=1 --reporter=line` -> exit `0`; `12 passed`
  - `NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/pilot/c1-01-pilot-ceremony-closed-loop.spec.ts --project=pilot-mk --workers=1 --reporter=line` -> exit `0`; `1 passed`
  - `NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/gate/member-diaspora.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1 --reporter=line` -> exit `0`; `2 passed`
  - `set -a; source .env.local; set +a; NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm pilot:check` -> exit `0`; final gate reported `92 passed (2.0m)` and `[PASS] All pilot readiness checks succeeded.`
  - `pnpm pilot:evidence:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --day 3 --date 2026-03-16 --owner "Platform Pilot Operator" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath n/a --reportPath docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md` -> exit `0`
  - `pnpm pilot:observability:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reference day-3 --date 2026-03-16 --owner "Admin KS" --logSweepResult expected-noise --functionalErrorCount 0 --expectedAuthDenyCount 2 --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes "Fresh rerun on 2026-03-17: pnpm pilot:check exited 0; targeted PD03 proofs also green (pilot closed-loop 1 passed, branch dashboard 12 passed, member diaspora gate 2 passed). Remaining console noise was expected negative-path auth and access-deny coverage from tenant-resolution and portal-isolation specs."` -> exit `0`
  - `pnpm pilot:decision:record -- --pilotId pilot-ks-7d-rehearsal-2026-03-16 --reviewType daily --reference day-3 --date 2026-03-16 --owner "Admin KS" --decision continue --observabilityRef day-3` -> exit `0`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                          |
| -------------------------- | ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Release gate               | pass                   | none                                           | `pnpm pilot:check` exited `0` and ended with `[PASS] All pilot readiness checks succeeded.`                    |
| Security and boundary      | pass                   | none                                           | Tenant-resolution, portal-isolation, and cross-tenant gate coverage passed in the final `pilot:check` run.     |
| Operational behavior       | pass                   | none                                           | Member dashboard readiness, claim creation, and related gate behavior all passed on the repair rerun.          |
| Role workflow              | pass                   | none                                           | Fresh Day 3 proof covered the closed handoff through member, agent, staff, branch-manager, and admin surfaces. |
| Observability and evidence | pass                   | none                                           | Canonical Day 3 evidence, observability, and decision rows now record the green outcome.                       |

## Release Gate Notes

- Release report path: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Evidence bundle path: `n/a`
- Pilot-entry artifact set complete (`yes`/`no`): `yes`
- Notes:
  - the copied evidence index stayed stable at the same pilot-specific path
  - the Day 3 daily row now meets the readiness cadence requirements: `green`, `0` incidents, `none`, `continue`
  - the ranked operator path remains available via `pnpm pilot:flow`

## Security And Boundary Notes

- Cross-tenant isolation: `revalidated fresh`; `pilot:check` finished green through tenant-resolution and isolation coverage
- Cross-branch isolation: `revalidated fresh`; branch dashboard navigation now opens branch detail routes correctly
- Group dashboard privacy: `revalidated fresh`
- Internal-note isolation: `revalidated fresh`
- Other boundary notes:
  - `apps/web/src/proxy.ts` remained untouched
  - no routing, auth, or tenancy refactor was introduced

## Operational Behavior Notes

- Matter count behavior: `revalidated fresh`
- SLA state behavior: `revalidated fresh`
- Accepted-case prerequisite behavior: `revalidated fresh`
- Guidance-only enforcement: `revalidated fresh`
- Other operational notes:
  - cookie-consent interference was neutralized in the pilot ceremony proof path
  - the pilot tenant can now authenticate cleanly through the intended tenant host contract
  - the pilot member baseline now includes the required membership state for claim creation

## Role Workflow Notes

### Member

- Notes:
  - member claim creation completed successfully in the repaired `PD03` ceremony proof
  - member dashboard and diaspora readiness markers both passed in fresh verification

### Agent

- Notes:
  - agent member-detail handoff now uses a stable detail-link path
  - claim handoff from member to agent completed inside the fresh `pilot-mk` proof

### Staff

- Notes:
  - staff access completed inside the fresh Day 3 proof without the earlier request-context failure
  - staff-facing claim detail and gate coverage were green in the full `pilot:check` rerun

### Branch Manager

- Recommendation (`continue`/`defer`/`escalate`/`n/a`): `continue`
- Notes:
  - branch dashboard navigation now lands on `/admin/branches/:branchId`
  - branch detail KPIs and health indicators passed in both `ks-sq` and `mk-mk`

### Admin

- Notes:
  - admin overview proof remained green during the repair rerun
  - admin custody of the Day 3 evidence row, observability row, and decision row is complete
  - final admin decision is `continue`

## Communications Notes

- Email: `n/a`
- In-app messaging: `n/a`
- Voice intake: `n/a`
- WhatsApp or hotline: `n/a`
- Fallback behavior: `n/a`

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`): `expected-noise`
- Functional errors count: `0`
- Expected auth denies count: `2`
- KPI condition (`within-threshold`/`watch`/`breach`): `within-threshold`
- Incident count: `0`
- Highest severity: `none`
- Incident refs: `day-3`
- Notes:
  - the only remaining log noise came from expected negative-path auth/access checks in tenant-resolution and isolation coverage
  - no functional production-path error remained in the final Day 3 rerun

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `green`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Executive recommendation if this is `PD07` (`expand`/`repeat_with_fixes`/`pause`/`stop`/`n/a`): `n/a`
- Branch manager recommendation: `continue`
- Admin decision: `continue`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `pilot-ready-20260316`

## Required Follow-Up

- Owner: `Platform`
- Deadline: `before Day 4 closeout`
- Action:
  - keep the pilot observability recorder deterministic when a same-reference row already exists; this did not block Day 3 after the copied evidence index was synchronized, but it should not require manual repair again

## Evidence References

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-7d-rehearsal-2026-03-16.md`
- Memory advisory retrieval: `n/a`
- Observability reference (`day-<n>`/`week-<n>`): `day-3`
- Decision reference (`day-<n>`/`week-<n>`): `day-3`
- Other repo-backed evidence:
  - `apps/web/e2e/pilot/c1-01-pilot-ceremony-closed-loop.spec.ts`
  - `apps/web/e2e/branch-dashboard.spec.ts`
  - `apps/web/e2e/gate/member-diaspora.spec.ts`
  - `apps/web/src/features/admin/branches/components/branch-health-card.tsx`
  - `apps/web/src/lib/tenant/tenant-hosts.ts`
  - `packages/database/src/e2e-users.ts`
  - `packages/database/src/seed-golden.ts`

## Summary Notes

- What passed:
  - fresh `PD03` closed-loop proof on `pilot-mk`
  - fresh branch-manager/admin proof via `branch-dashboard.spec.ts`
  - fresh member readiness proof via `member-diaspora.spec.ts`
  - full `pnpm pilot:check`
  - canonical Day 3 evidence and decision rows
- What changed during the repair:
  - stabilized the pilot ceremony around cookie-consent and success-path handling
  - restored branch-detail routing in the branch health card
  - extended pilot tenant host and fixture coverage
  - added pilot membership seed coverage required for the closed loop
- Final assessment:
  - Day 3 is now green and Day 4 can proceed
