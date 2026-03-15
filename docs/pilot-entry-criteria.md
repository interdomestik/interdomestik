Interdomestik — Pilot Entry Criteria v1.0

Pilot may begin when all conditions below are satisfied:

1. Production Release Gate is GREEN

- `pnpm pilot:check` returns exit code 0
- `pnpm release:gate:prod -- --pilotId <pilot-id>` returns exit code 0
- The canonical pilot-entry artifact set defined in `docs/pilot/PILOT_RUNBOOK.md` exists:
  - a new release-gate record in `docs/release-gates/`
  - a copied per-pilot evidence index in `docs/pilot/`
  - a canonical pointer row in `docs/pilot-evidence/index.csv`
- Daily pilot operation records are written into that copied per-pilot evidence index, not a separate note stream.
- Daily and weekly continue/pause/hotfix/stop decisions are recorded in that same copied evidence index via `pnpm pilot:decision:record -- --pilotId <pilot-id>`.
- Any rollback target used in a decision row is created or verified through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`.
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
