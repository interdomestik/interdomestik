Interdomestik — Pilot Entry Criteria v1.0

Pilot may begin when all conditions below are satisfied:

1. Production Release Gate is GREEN

- `pnpm pilot:check` returns exit code 0
- A new release-gate record exists in `docs/release-gates/`
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
