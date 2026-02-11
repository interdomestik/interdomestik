# Release Gate — Production — 2026-02-11

## Deployment

- Environment: Production
- Alias: https://interdomestik-web.vercel.app
- Deployment ID: dpl_3UMSijeubaShN5f4zkLK6LKPm4rs
- Deployment URL: https://interdomestik-6xj6njr13-ecohub.vercel.app
- Commit SHA: ec9d8c550
- Deployer: Codex
- Change summary:
  - Enforced tenant-scoped admin user profile reads at data boundary.
  - Hardened upload bucket configuration (fail-fast in production, validated bucket name).
  - Added idempotent bucket migration and upload route coverage for missing config.

## Preconditions

- [x] Database migrations applied (if any): yes (`supabase/migrations/00008_ensure_claim_evidence_bucket.sql`)
- [x] Environment variables verified (if any changes): yes (`NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET`)
- [x] Feature flags / rollout config: none

## Gate Scope

This release gate covers:

- RBAC (member/agent/staff/admin)
- Cross-tenant isolation
- Evidence upload signing + persistence
- Staff claim update persistence
- Production error log sweep

## Test Accounts Used

- Member-only: member.ks.a1@interdomestik.com
- Member+Agent: agent.ks.a1@interdomestik.com
- Member+Staff: staff.ks.2@interdomestik.com
- Admin (KS): admin.ks@interdomestik.com
- Admin (MK): admin.mk@interdomestik.com

---

# P0 — Security & Isolation

## P0.1 RBAC Route Access Matrix (marker-based)

**Result:** PASS

Evidence (per role):

- Member-only:
  - /en/member: marker visible (`dashboard-page-ready`)
  - /en/agent: privileged markers absent
  - /en/staff: privileged markers absent
  - /en/admin: privileged markers absent
- Agent:
  - /en/agent: marker visible (`action-campaign`)
  - /en/staff, /en/admin: absent
- Staff:
  - /en/staff: marker visible (`staff-page-ready`)
  - /en/agent, /en/admin: absent
- Admin:
  - /en/admin: marker visible (`admin-page-ready`)
  - /en/agent, /en/staff: absent

Notes:

- Denied routes returned shell `200` in some cases; verification is marker/data visibility-based.

## P0.2 Cross-Tenant Isolation

**Result:** PASS

Test:

- As `admin.mk@interdomestik.com`, requested:
  - `/en/admin/users/golden_ks_staff?tenantId=tenant_ks`

Expected:

- notFound/denied UI; no KS user data visible.

Observed:

- Admin 404 content rendered; `user-roles-table` marker absent.

---

# P1 — Must-Pass Functionality

## P1.1 Member Evidence Upload Persistence

**Result:** PASS

Steps:

1. Uploaded file: `matrix-upload-1770790385822.txt` (text file)
2. Hard refresh: file still listed
3. Logout/login: file still listed

Network evidence:

- Signed upload endpoint status: `200`
- Request pattern: `/storage/v1/object/upload/sign/claim-evidence/...`
- Error strings: none

## P1.2 Staff Claim Update Persistence (Status + Note)

**Result:** PASS

Steps:

1. Updated existing staff claim from `/en/staff/claims`
2. Status changed: `Verification -> Draft`
3. Added note: `Matrix note 1770790406946`
4. Hard refresh: both status and note persisted

Evidence markers:

- status marker: `staff-claim-detail-claim`
- note marker/testid: `staff-claim-detail-note`

---

# P1.5 — Observability

## P1.5.1 Production Error Log Sweep (60m)

**Result:** PASS

Command:

- `vercel logs --environment production --since 60m --no-branch --level error`

Output summary:

- Authorization-deny entries from negative RBAC tests only (`[PortalAccess] Authorization check failed...`).
- No upload/signing/storage functional errors.

Notes:

- Authorization-deny noise during negative route tests is expected.

---

# Verdict

## Final Status

- **GO**

## If NO-GO: Failing Signatures

- N/A

## Follow-ups / Tech Debt

- Add one-command post-deploy gate runner that emits this template automatically.
- Add monitoring alert for storage signing failures (`/api/uploads` 5xx or storage sign non-2xx).
