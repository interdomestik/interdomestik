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
- Day Number: `1`
- Date (`YYYY-MM-DD`): `2026-03-15`
- Scenario ID (`PD01`-`PD14`): `PD01`
- Scenario Name: `Release Gate Green Baseline`
- Mode (`rehearsal`/`live`): `rehearsal`
- Tenant: `KS`
- Branch: `KS`
- Owner: `Platform Pilot Operator`
- Branch Manager Reviewed (`yes`/`no`): `no`
- Admin Reviewer: `Admin KS`

## Expected Outcome

- Expected color: `green`
- Expected decision: `continue`
- Rollback target if applicable: `n/a`

## Scenario Setup Notes

- Seed pack or setup reference: fresh `pnpm pilot:check` completed green on March 16, 2026 after the release-verification fixes were already in place and the deterministic seed/reset path completed without manual repair.
- Starting claim or member ids: `golden_ks_a_member_1`, `golden_ks_staff`, `golden_ks_a_claim_04`, production pilot accounts used by the release-gate runner.
- Special condition: Day 1 reference date remains March 15, 2026; the authoritative green rerun executed on March 16, 2026 against production alias `https://interdomestik-web.vercel.app`, pointing to deployment `dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1`.
- Commands run:
  - `pnpm pilot:check` -> exit `0`; `92 passed`; `[PASS] All pilot readiness checks succeeded.`
  - `pnpm release:gate:prod -- --pilotId pilot-ks-rehearsal-2026-03-15` -> exit `0`; canonical pilot-entry artifacts verified with report `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
  - `pnpm pilot:evidence:record -- --pilotId pilot-ks-rehearsal-2026-03-15 --day 1 --date 2026-03-15 --owner "Platform Pilot Operator" --status green --incidentCount 0 --highestSeverity none --decision continue --bundlePath n/a --reportPath docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md` -> exit `0`
  - `pnpm pilot:observability:record -- --pilotId pilot-ks-rehearsal-2026-03-15 --reference day-1 --date 2026-03-15 --owner "Admin KS" --logSweepResult expected-noise --functionalErrorCount 0 --expectedAuthDenyCount 0 --kpiCondition within-threshold --incidentCount 0 --highestSeverity none --notes "rerun on 2026-03-16: release gate GO on dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1; all P0/P1/G07-G10 checks passed; recoverable auth 429 retries were absorbed by the runner without contract failure"` -> exit `0`
  - `pnpm pilot:decision:record -- --pilotId pilot-ks-rehearsal-2026-03-15 --reviewType daily --reference day-1 --date 2026-03-15 --owner "Admin KS" --decision continue --observabilityRef day-1` -> exit `0`

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes                                                                                                                                                                                                               |
| -------------------------- | ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release gate               | pass                   | none                                           | `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md` ended `GO` with `P0.1`, `P0.2`, `P0.3`, `P0.4`, `P0.6`, `P1.1`, `P1.2`, `P1.3`, `P1.5.1`, `G07`, `G08`, `G09`, and `G10` all `PASS`. |
| Security and boundary      | pass                   | none                                           | Cross-tenant isolation, role boundaries, aggregate-only office-agent boundary, and internal-note isolation checks all held on the fresh Day 1 rerun.                                                                |
| Operational behavior       | pass                   | none                                           | Upload/download persistence, staff claim persistence, commercial promise surfaces, matter/SLA surfaces, and accepted-case agreement plus collection fallback all passed on the live alias.                          |
| Role workflow              | pass                   | none                                           | Member, agent, office-agent, staff, and admin flows all completed the required marker-based Day 1 contract without routing or tenancy drift.                                                                        |
| Observability and evidence | pass                   | none                                           | Release report exists, copied evidence index exists, pointer row exists, and the Day 1 sheet plus canonical row refresh are being recorded against the stable copied index path.                                    |

## Release Gate Notes

- Release report path: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Evidence bundle path: `n/a`
- Pilot-entry artifact set complete (`yes`/`no`): `yes`
- Notes:
  - The production rerun stayed on the same deployed alias and emitted the same canonical green report path for the live deployment.
  - Pointer custody remains canonical in `docs/pilot-evidence/index.csv`, with the latest pointer row marked `GO`.
  - The copied pilot evidence index path stayed stable at `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-rehearsal-2026-03-15.md`.

## Security And Boundary Notes

- Cross-tenant isolation: `pass`; `P0.2` remained green on the fresh run.
- Cross-branch isolation: `pass`; route and branch separation checks remained intact.
- Group dashboard privacy: `pass`; `G08` now passes with the informational-only and aggregate-only boundary contract visible on production.
- Internal-note isolation: `pass`; member detail still hides staff-only internal history notes while staff retains the internal explanation.
- Other boundary notes:
  - `P0.1`, `P0.3`, `P0.4`, and `P0.6` all remained green.
  - No privacy leak, tenancy bleed, or RBAC bypass signature was reported.

## Operational Behavior Notes

- Commercial promise behavior: `G07` passed; pricing, register, and services commercial promise surfaces are now visible and contract-complete.
- Matter count behavior: `G09` passed; member and staff matter allowance plus SLA surfaces remained visible on canonical detail pages.
- SLA state behavior: `G09` passed; running and incomplete-state SLA signals held on the live routes.
- Accepted-case prerequisite behavior: `G10` passed; escalation agreement summary, accepted recovery prerequisites, and collection fallback surfaces all held.
- Other operational notes:
  - `P1.1`, `P1.2`, `P1.3`, and `P1.5.1` all remained green on the fresh verification cycle.
  - No Day 1 workaround was required to achieve the green release verdict.

## Role Workflow Notes

### Member

- Notes:
  - Member upload, download, claim detail, and CTA navigation checks all passed on the fresh local and production verifications.
  - The commercial and trust surfaces visible to members now match the Day 1 baseline contract.

### Agent

- Notes:
  - Agent workspace claim selection and persisted message behavior held on the fresh gate run.
  - Agent-scoped access remained limited to assigned/member-authorized claims.

### Staff

- Notes:
  - Staff claim detail persistence, action readiness markers, and accepted-case operational surfaces all passed.
  - Staff retained the internal explanation where the member view intentionally showed only the safe public state.

### Branch Manager

- Recommendation (`continue`/`defer`/`escalate`/`n/a`): `n/a`
- Notes:
  - PD01 remained in platform/admin custody.
  - No branch-manager-specific judgment was required for the release-gate baseline.

### Admin

- Notes:
  - `Admin KS` reviewed the final Day 1 rerun against the PD01 execution contract.
  - The final Day 1 judgment is `green` with decision `continue` because both required verification commands exited `0` and the canonical artifact chain is intact.

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
  - Production login attempts for staff, admin, and office-agent hit recoverable `429` throttles before succeeding on retry.
  - The runner absorbed those retries, the release verdict still ended `GO`, and no functional Day 1 contract failed.
  - This is operational noise to harden later, not a Day 1 blocker.

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`): `green`
- Final decision (`continue`/`pause`/`hotfix`/`stop`): `continue`
- Branch manager recommendation: `n/a`
- Admin decision: `continue`
- Resume requires `pnpm pilot:check` (`yes`/`no`): `no`
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`): `no`
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`): `n/a`

## Required Follow-Up

- Owner: `Platform Engineering`
- Deadline: `post-Day-1 hardening backlog`
- Action:
  - reduce release-gate auth churn with shared session reuse and centralized backoff handling
  - keep this as an optimization follow-up only; it does not block Day 2

## Evidence References

- Release report: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Copied evidence index: `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-rehearsal-2026-03-15.md`
- Observability reference (`day-<n>`/`week-<n>`): `day-1`
- Decision reference (`day-<n>`/`week-<n>`): `day-1`
- Other repo-backed evidence:
  - `docs/pilot-evidence/index.csv`

## Summary Notes

- What passed:
  - `pnpm pilot:check`
  - `pnpm release:gate:prod -- --pilotId pilot-ks-rehearsal-2026-03-15`
  - `P0.1`, `P0.2`, `P0.3`, `P0.4`, `P0.6`
  - `P1.1`, `P1.2`, `P1.3`, `P1.5.1`
  - `G07`, `G08`, `G09`, `G10`
  - release report custody, copied evidence index custody, and pointer-row custody
- What failed:
  - none
- What needs follow-up tomorrow:
  - optional auth-throttle hardening in the release-gate runner
- Anything that could change go/no-go posture:
  - a future production regression in the release gate would reopen `PD01`, but Day 1 itself is complete and green on the current authoritative rerun
