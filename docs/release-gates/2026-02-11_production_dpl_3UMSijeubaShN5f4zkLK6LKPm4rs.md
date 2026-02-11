# Release Gate — production — 2026-02-11

## Deployment

- Environment: production
- Alias: https://interdomestik-web.vercel.app
- Deployment ID: dpl_3UMSijeubaShN5f4zkLK6LKPm4rs
- Deployment URL: https://interdomestik-6xj6njr13-ecohub.vercel.app
- Deployment provenance: vercel-inspect
- Commit SHA: not available
- Deployer: release-gate runner
- Change summary:
- Deterministic scripted release gate run
- Scope: ALL (P0.1, P0.2, P0.3, P0.4, P1.1, P1.2, P1.3, P1.5.1)
- Generated at: 2026-02-11T13:10:02.989Z

## Preconditions

- [x] Database migrations applied (if any): not evaluated by runner
- [x] Environment variables verified (if any changes): required release gate env vars present (10)
- [x] Feature flags / rollout config: none

## Gate Scope

This release gate covers:

- RBAC (member/agent/staff/admin)
- Cross-tenant isolation
- Admin role add/remove
- Evidence upload/download + persistence
- Staff claim update persistence
- Production error log sweep

## Test Accounts Used

- Member-only: member.ks.a1@interdomestik.com
- Agent: agent.ks.a1@interdomestik.com
- Staff: staff.ks.2@interdomestik.com
- Admin (KS): admin.ks@interdomestik.com
- Admin (MK): admin.mk@interdomestik.com

---

# P0 — Security & Isolation

## P0.1 RBAC Route Access Matrix (marker-based)

**Result:** PASS

Evidence:

- member /member => member=true, agent=false, staff=false, admin=false
- member /agent => member=false, agent=false, staff=false, admin=false
- member /staff => member=false, agent=false, staff=false, admin=false
- member /admin => member=false, agent=false, staff=false, admin=false
- agent /member => member=true, agent=true, staff=false, admin=false
- agent /agent => member=true, agent=true, staff=false, admin=false
- agent /staff => member=false, agent=false, staff=false, admin=false
- agent /admin => member=false, agent=false, staff=false, admin=false
- staff /member => member=true, agent=false, staff=true, admin=false
- staff /agent => member=false, agent=false, staff=false, admin=false
- staff /staff => member=true, agent=false, staff=true, admin=false
- staff /admin => member=false, agent=false, staff=false, admin=false
- admin_ks /member => member=true, agent=false, staff=false, admin=true
- admin_ks /agent => member=false, agent=false, staff=false, admin=false
- admin_ks /staff => member=false, agent=false, staff=false, admin=false
- admin_ks /admin => member=true, agent=false, staff=false, admin=true

## P0.2 Cross-Tenant Isolation

**Result:** PASS

Observed:

- route=https://interdomestik-web.vercel.app/en/admin/users/golden_ks_staff?tenantId=tenant_ks not-found-page=true user-roles-table=false

## P0.3 Admin Role Assignment Works

**Result:** PASS

Observed:

- target=https://interdomestik-web.vercel.app/en/admin/users/golden_ks_staff
- pre-clean removed_existing_role_entries=0
- added_role=promoter visible_in_roles_table=true

## P0.4 Admin Role Removal Works

**Result:** PASS

Observed:

- removed_role=promoter remaining_in_roles_table=false

---

# P1 — Must-Pass Functionality

## P1.1 Member Evidence Upload Persistence

**Result:** PASS

Observed:

- upload file listed after submit: gate-upload-1770815354903.txt
- after hard refresh listed=true
- after logout/login listed=true
- signed upload statuses: 200@https://gunosplgrvnvrftudttr.supabase.co/storage/v1/object/upload/sign/claim-evidence/pii/tenants/tenant_ks/claims/golden_ks_a_claim_05/5fa7f8a9-7125-4d0c-b036-9524bfb17dfb.txt?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82OWMyODZlNy0wZWZlLTQ5OGItOTkxNS0zMzNhYmUxNDhhZWQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbGFpbS1ldmlkZW5jZS9waWkvdGVuYW50cy90ZW5hbnRfa3MvY2xhaW1zL2dvbGRlbl9rc19hX2NsYWltXzA1LzVmYTdmOGE5LTcxMjUtNGQwYy1iMDM2LTk1MjRiZmIxN2RmYi50eHQiLCJ1cHNlcnQiOnRydWUsImlhdCI6MTc3MDgxNTM2MiwiZXhwIjoxNzcwODIyNTYyfQ.FgGv-UOI_QBq53sz1oR-7IiQWoUAi9h5glOUd1EA97M

## P1.2 Member Evidence Download Works

**Result:** PASS

Observed:

- download response 200 observed=true
- download response statuses: 200@https://interdomestik-web.vercel.app/api/documents/5fa7f8a9-7125-4d0c-b036-9524bfb17dfb/download
- inline/open action succeeded=true

## P1.3 Staff Claim Update Persistence (Status + Note)

**Result:** PASS

Observed:

- staff_claims_list_url=https://interdomestik-web.vercel.app/en/staff/claims
- staff_page_ready_on_list=true
- claim_source=STAFF_CLAIM_URL
- claim_url=https://interdomestik-web.vercel.app/en/staff/claims/golden_ks_a_claim_08
- detail_not_found=false
- staff_page_ready_on_detail=false
- status_change=Submitted -> Draft
- note persisted=true note="gate-note-1770815390987"
- status persisted=true expected="Draft" actual="Draft"

---

# P1.5 — Observability

## P1.5.1 Production Error Log Sweep (60m)

**Result:** PASS

Observed:

- total error lines=105
- non-noise lines=105
- Vercel CLI 50.13.2
- Retrieving project…
- Fetching logs...
- TIME HOST LEVEL STATUS MESSAGE
- 14:09:38.17 interdomestik-web.vercel.app error λ GET /api/documents/5fa7f8a9-7125-4d0c-b036-9524bfb17dfb/download --- Audit log…
- 14:09:36.13 interdomestik-web.vercel.app error λ GET /api/documents/5fa7f8a9-7125-4d0c-b036-9524bfb17dfb/download 200 Audit log…

---

# Verdict

## Final Status

- **GO**

## If NO-GO: Failing Signatures

- N/A

## Follow-ups / Tech Debt

- i18n coverage intentionally excluded from this gate; handled by nightly jobs.
