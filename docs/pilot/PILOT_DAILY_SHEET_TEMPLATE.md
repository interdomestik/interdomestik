# Pilot Daily Sheet Template

Use this template as the human-readable daily scoring and note-taking sheet for one pilot day.

This template does not replace the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file.

It is the working-note layer. The copied evidence index remains the canonical pilot record.

Use it to:

- score the day as `green`, `amber`, `red`, or `blocked`
- capture branch-level and admin-level notes
- collect evidence references before writing canonical observability and decision rows
- record the orchestration model explicitly for that day

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
- `blocked`: working-sheet-only state meaning required evidence is missing, so no trustworthy canonical color or decision can be assigned yet

## Gate Rules

Score every day against these five gates:

1. `Release gate`
2. `Security and boundary`
3. `Operational behavior`
4. `Role workflow`
5. `Observability and evidence`

If any gate fails because of privacy, tenancy, RBAC, agreement, collection, or rollback-critical behavior, the day is `red`.

If evidence custody is incomplete, the day is `blocked` until fixed.

Do not write `blocked` into the canonical evidence index. Resolve or rerun the day until it can be recorded as `green`, `amber`, or `red`.

## Working Notes vs Canonical Evidence

Use this sheet to capture human-readable notes, orchestration context, and evidence references before writing canonical rows.

Then write the canonical state into the copied evidence index with:

- `pnpm pilot:evidence:record`
- `pnpm pilot:observability:record`
- `pnpm pilot:decision:record`

---

## Pilot Day Header

- Pilot ID:
- Day Number:
- Date (`YYYY-MM-DD`):
- Scenario ID (`PD01`-`PD07`):
- Scenario Name:
- Mode (`rehearsal`/`live`):
- Tenant:
- Branch:
- Owner:
- Branch Manager Reviewed (`yes`/`no`):
- Admin Reviewer:

## Orchestration Traceability

- Lead orchestrator:
- Worker lanes used:
- Worker lane scopes:
- What remained centralized:
- Evidence merged by:
- Final daily judgment made by:
- `Single-orchestrator run` (`yes`/`no`):
- If yes, why:

## Expected Outcome

- Expected color:
- Expected decision:
- Rollback target if applicable:

## Scenario Setup Notes

- Seed pack or setup reference:
- Starting claim or member ids:
- Special condition:
- Commands run:

## Gate Scorecard

| Gate                       | Result (`pass`/`fail`) | Highest severity (`none`/`sev3`/`sev2`/`sev1`) | Notes |
| -------------------------- | ---------------------- | ---------------------------------------------- | ----- |
| Release gate               |                        |                                                |       |
| Security and boundary      |                        |                                                |       |
| Operational behavior       |                        |                                                |       |
| Role workflow              |                        |                                                |       |
| Observability and evidence |                        |                                                |       |

## Release Gate Notes

- Release report path:
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

- Recommendation (`continue`/`defer`/`escalate`/`n/a`):
- Notes:

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
- Executive recommendation if this is `PD07` (`expand`/`repeat_with_fixes`/`pause`/`stop`/`n/a`):
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
- Memory advisory retrieval:
- Observability reference (`day-<n>`/`week-<n>`):
- Decision reference (`day-<n>`/`week-<n>`):
- Other repo-backed evidence:

## Summary Notes

- What passed:
- What failed:
- What needs follow-up tomorrow:
- Anything that could change go/no-go posture:
