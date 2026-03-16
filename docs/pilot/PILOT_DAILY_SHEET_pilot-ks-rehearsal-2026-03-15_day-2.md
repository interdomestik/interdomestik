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
- Commands run:
  - pending execution

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes |
| -------------------------- | ---------------------- | ---------------------------------------------- | ----- |
| Release gate               |                        |                                                |       |
| Security and boundary      |                        |                                                |       |
| Operational behavior       |                        |                                                |       |
| Role workflow              |                        |                                                |       |
| Observability and evidence |                        |                                                |       |

## Release Gate Notes

- Release report path: `docs/release-gates/2026-03-16_production_dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1.md`
- Evidence bundle path:
- Pilot-entry artifact set complete (`yes`/`no`):
- Notes:

## Security And Boundary Notes

- Cross-tenant isolation:
- Cross-branch isolation:
- Group dashboard privacy:
- Internal-note isolation:
- Other boundary notes:

## Operational Behavior Notes

- Matter count behavior:
- SLA state behavior:
- Accepted-case prerequisite behavior:
- Guidance-only enforcement:
- Other operational notes:

## Role Workflow Notes

### Member

- Notes:

### Agent

- Notes:

### Staff

- Notes:

### Branch Manager

- Recommendation (`continue`/`defer`/`escalate`/`n/a`): `n/a`
- Notes:
  - `PD02` is handled as a centralized rollback-baseline governance scenario rather than a branch-local workflow scenario.

### Admin

- Notes:

## Communications Notes

- Email:
- In-app messaging:
- Voice intake:
- WhatsApp or hotline:
- Fallback behavior:

## Observability Notes

- Log sweep result (`clear`/`expected-noise`/`action-required`):
- Functional errors count:
- Expected auth denies count:
- KPI condition (`within-threshold`/`watch`/`breach`):
- Incident count:
- Highest severity:
- Incident refs:
- Notes:

## End-Of-Day Decision

- Final color (`green`/`amber`/`red`/`blocked`):
- Final decision (`continue`/`pause`/`hotfix`/`stop`):
- Branch manager recommendation:
- Admin decision:
- Resume requires `pnpm pilot:check` (`yes`/`no`):
- Resume requires fresh `pnpm release:gate:prod -- --pilotId <pilot-id>` (`yes`/`no`):
- Rollback tag (`pilot-ready-YYYYMMDD`/`n/a`):

## Required Follow-Up

- Owner:
- Deadline:
- Action:

## Evidence References

- Release report:
- Copied evidence index:
- Observability reference (`day-<n>`/`week-<n>`):
- Decision reference (`day-<n>`/`week-<n>`):
- Other repo-backed evidence:

## Summary Notes

- What passed:
- What failed:
- What needs follow-up tomorrow:
- Anything that could change go/no-go posture:
