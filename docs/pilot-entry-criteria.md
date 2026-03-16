Interdomestik — Pilot Entry Criteria v1.0

Pilot may begin when all conditions below are satisfied:

1. Production Release Gate is GREEN

- `pnpm pilot:check` returns exit code 0
- Run `pnpm pilot:cadence:check -- --pilotId <pilot-id>` and require a 3-day qualifying green streak before pilot entry or resume.
- `pnpm release:gate:prod -- --pilotId <pilot-id>` returns exit code 0
- The canonical pilot-entry artifact set defined in `docs/pilot/PILOT_RUNBOOK.md` exists:
  - a new release-gate record in `docs/release-gates/`
  - a copied per-pilot evidence index in `docs/pilot/`
  - a canonical pointer row in `docs/pilot-evidence/index.csv`
- Daily pilot operation records are written into that copied per-pilot evidence index, not a separate note stream.
- Observability evidence records log-sweep result, KPI condition, incident count, and highest severity in that same copied evidence index via `pnpm pilot:observability:record -- --pilotId <pilot-id>`.
- Daily and weekly continue/pause/hotfix/stop decisions are recorded in that same copied evidence index via `pnpm pilot:decision:record -- --pilotId <pilot-id>`.
- Any rollback target used in a decision row is created or verified through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`.
- Reset-gate learning retrievals are reviewed before the new run, and the intended pilot trigger is the top hit for each required query.
- Deployment ID documented

2. RBAC & Tenant Isolation Verified

- RBAC matrix passes (member/agent/staff/admin)
- Cross-tenant access blocked at data boundary

3. Evidence Flow Stable

- Upload succeeds (signed URL 200)
- Persistence across refresh and relogin confirmed
- Download works

4. Staff Operational Flow Stable

- Claim status update persists
- Claim note persists and is visible after refresh

5. Observability Clean

- No unexpected production errors in last 60 minutes
- Only expected authorization-deny logs during negative tests

6. Day-7 Rehearsal Contract Ready

- The active pilot model is the 7-day rehearsal, not the superseded 14-day sequence.
- `PD07` will produce `docs/pilot/PILOT_EXEC_REVIEW_<pilot-id>.md` as the canonical executive review artifact.
