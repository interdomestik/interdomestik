# Release Gate — <ENV> — <DATE>

## Deployment

- Environment: <Production | Staging | Preview>
- Alias: <https://...>
- Deployment ID: <dpl\_...>
- Deployment URL: <https://...vercel.app>
- Commit SHA: <...> (or "not available")
- Deployer: <name/agent>
- Change summary: <1–3 bullets>

## Preconditions

- [ ] Database migrations applied (if any): <yes/no + refs>
- [ ] Environment variables verified (if any changes): <yes/no + list>
- [ ] Feature flags / rollout config: <none | details>

## Gate Scope

This release gate covers:

- RBAC (member/agent/staff/admin)
- Cross-tenant isolation
- Evidence upload signing + persistence
- Staff claim update persistence
- Production error log sweep

## Test Accounts Used

- Member-only: <email>
- Member+Agent: <email>
- Member+Staff: <email>
- Admin (KS): <email>
- Admin (MK): <email> (for cross-tenant check)

---

# P0 — Security & Isolation

## P0.1 RBAC Route Access Matrix (marker-based)

**Result:** <PASS/FAIL>

Evidence (per role):

- Member-only:
  - /<locale>/member: <marker(s) visible>
  - /<locale>/agent: <privileged markers absent>
  - /<locale>/staff: <privileged markers absent>
  - /<locale>/admin: <privileged markers absent>
- Agent:
  - /agent: <marker(s) visible>
  - /staff, /admin: <absent>
- Staff:
  - /staff: <marker(s) visible>
  - /agent, /admin: <absent>
- Admin:
  - /admin: <marker(s) visible>
  - /agent, /staff: <absent>

Notes:

- Denied routes may return HTTP 200 for shell; verification is based on privileged markers/data visibility.

## P0.2 Cross-Tenant Isolation

**Result:** <PASS/FAIL>

Test:

- As <admin.mk>, request:
  - /<locale>/admin/users/<ks_user_id>?tenantId=tenant_ks
    Expected:
- notFound/denied UI; no KS user data visible (e.g., roles table absent)

Observed:

- <what you saw + any marker(s)>

---

# P1 — Must-Pass Functionality

## P1.1 Member Evidence Upload Persistence

**Result:** <PASS/FAIL>

Steps:

1. Upload file: <filename + type>
2. Hard refresh: <still listed?>
3. Logout/login: <still listed?>

Network evidence:

- Signed upload endpoint status: <200/4xx>
- Any error strings: <none | paste>

## P1.2 Staff Claim Update Persistence (Status + Note)

**Result:** <PASS/FAIL>

Steps:

1. Update claim: <claim id/url>
2. Status change: <from -> to>
3. Add note: <short excerpt>
4. Hard refresh: status persists? note persists?

Evidence markers:

- status marker: <...>
- note marker/testid: <staff-claim-detail-note> (or equivalent)

---

# P1.5 — Observability

## P1.5.1 Production Error Log Sweep (60m)

**Result:** <PASS/FAIL>

Command:

- `vercel logs --environment production --since 60m --no-branch --level error`

Output summary:

- <No logs found | list key errors>

Notes:

- Authorization-deny entries during negative testing are expected; functional errors are not.

---

# Verdict

## Final Status

- **GO / NO-GO**

## If NO-GO: Failing Signatures

- <bullet list: what failed + exact error string + suspected root cause>

## Follow-ups / Tech Debt

- <optional: improvements, monitoring, next gates>
