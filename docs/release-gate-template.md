# Release Gate — <ENV> — <DATE>

Run with `pnpm release:gate -- --baseUrl https://interdomestik-web.vercel.app --envName production --suite all`; report is written to `docs/release-gates/YYYY-MM-DD_<envName>_<deploymentIdOrUnknown>.md`.

For pilot entry, add `--pilotId <pilot-id>` so the same run also creates the canonical pilot evidence copy and pointer row described in `docs/pilot/PILOT_RUNBOOK.md`.

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
- Commercial promise surfaces
- Accepted-case escalation agreement + collection fallback enforcement
- Production error log sweep

## Test Accounts Used

- Member-only: <email>
- Agent: <email>
- Office agent: <email>
- Staff: <email>
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

# P6 — RC Gate

## G07 Commercial Promise Surfaces

**Result:** <PASS/FAIL>

Observed:

- /pricing: disclaimers, success-fee calculator, billing terms, coverage matrix <present/missing>
- /register: success-fee calculator, billing terms, coverage matrix <present/missing>
- /services: disclaimers, coverage matrix <present/missing>
- /member/membership: disclaimers, coverage matrix <present/missing>

## G08 Free Start And Group Privacy Boundaries

**Result:** <PASS/FAIL>

Observed:

- /: `free-start-triage-note` and boundary copy confirm Free Start stays informational-only and hotline stays routing-only <present/missing>
- /agent/import: `group-dashboard-summary` and aggregate-only privacy copy are present for office-tier agent access <present/missing>
- /agent/import: seeded member-identifying text (for example `KS A-Member 1`) stays absent from the aggregate dashboard <hidden/leaked>

## G09 Matter And SLA Enforcement

**Result:** <PASS/FAIL>

Observed:

- /member/claims/golden_ks_a_claim_05: matter allowance card stays visible with used `0`, remaining `2`, total `2`, and member-facing SLA text stays `Response timer is running.` <present/missing>
- /member/claims/golden_ks_a_claim_13: matter allowance card stays visible with used `0`, remaining `2`, total `2`, and member-facing SLA text stays `Waiting for your information before the SLA starts.` <present/missing>
- /staff/claims/golden_ks_a_claim_05: staff detail stays ready with matter allowance values `0 / 2 / 2` and staff-facing SLA text stays `Running` <present/missing>
- /staff/claims/golden_ks_a_claim_13: staff detail stays ready with matter allowance values `0 / 2 / 2` and staff-facing SLA text stays `Waiting for member information` <present/missing>

## G10 Escalation Agreement And Collection Fallback

**Result:** <PASS/FAIL>

Observed:

- /staff/claims/golden_ks_a_claim_14: accepted-recovery prerequisites stay blocked with agreement `Missing` and collection path `Missing` until the escalation agreement is signed <present/missing>
- /staff/claims/golden_ks_a_claim_15: accepted-case agreement summary stays present and success-fee collection summary stays `Deduct from payout` <present/missing>
- /staff/claims/golden_ks_a_claim_17: accepted-case agreement summary stays present and success-fee collection summary stays `Charge stored payment method` <present/missing>
- /staff/claims/golden_ks_a_claim_16: accepted-case agreement summary stays present and success-fee collection summary stays `Invoice fallback` with the seeded invoice due date <present/missing>

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
