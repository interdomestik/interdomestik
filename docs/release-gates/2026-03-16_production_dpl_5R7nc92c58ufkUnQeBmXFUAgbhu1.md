# Release Gate — production — 2026-03-16

## Deployment

- Environment: production
- Alias: https://interdomestik-web.vercel.app
- Deployment ID: dpl_5R7nc92c58ufkUnQeBmXFUAgbhu1
- Deployment URL: https://interdomestik-4oqnost9l-ecohub.vercel.app
- Deployment provenance: vercel-inspect
- Commit SHA: not available
- Deployer: release-gate runner
- Change summary:
- Deterministic scripted release gate run
- Scope: ALL (P0.1, P0.2, P0.3, P0.4, P0.6, P1.1, P1.2, P1.3, P1.5.1, G07, G08, G09, G10)
- Generated at: 2026-03-16T15:00:46.723Z

## Preconditions

- [x] Database migrations applied (if any): not evaluated by runner
- [x] Environment variables verified (if any changes): required release gate env vars present (11)
- [x] Feature flags / rollout config: none

## Gate Scope

This release gate covers:

- RBAC (member/agent/staff/admin)
- Cross-tenant isolation
- Admin role add/remove
- Evidence upload/download + persistence
- Staff claim update persistence
- Commercial promise surfaces (coverage, fees, disclaimers, refund terms)
- Free Start informational-only and aggregate-only privacy boundaries
- Member and staff matter allowance plus SLA enforcement surfaces
- Accepted-case escalation agreement and success-fee collection fallback surfaces
- Production error log sweep

## Test Accounts Used

- Member-only: [REDACTED_EMAIL]
- Agent: [REDACTED_EMAIL]
- Office agent: [REDACTED_EMAIL]
- Staff: [REDACTED_EMAIL]
- Admin (KS): [REDACTED_EMAIL]
- Admin (MK): [REDACTED_EMAIL]

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

- target_source=env-cross-tenant-probe
- target_fallback_allowed=true
- target=https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_1
- pre-clean removed_existing_role_entries=0
- added_role=promoter visible_in_roles_table=true

## P0.4 Admin Role Removal Works

**Result:** PASS

Observed:

- removed_role=promoter remaining_in_roles_table=false

## P0.6 RBAC Stress Matrix v1

**Result:** PASS

### S1 Mixed roles: member+agent

- Account used: agent
- URL(s): https://interdomestik-web.vercel.app/en/member | https://interdomestik-web.vercel.app/en/agent | https://interdomestik-web.vercel.app/en/staff | https://interdomestik-web.vercel.app/en/admin
- Expected markers: /member member=true; /agent agent=true; /staff staff=false; /admin admin=false
- Observed markers: https://interdomestik-web.vercel.app/en/member => member=true, agent=true, staff=false, admin=false, notFound=false, rolesTable=false || https://interdomestik-web.vercel.app/en/agent => member=true, agent=true, staff=false, admin=false, notFound=false, rolesTable=false || https://interdomestik-web.vercel.app/en/staff => member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false || https://interdomestik-web.vercel.app/en/admin => member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S2 Mixed roles: member+staff

- Account used: staff
- URL(s): https://interdomestik-web.vercel.app/en/member | https://interdomestik-web.vercel.app/en/staff | https://interdomestik-web.vercel.app/en/agent | https://interdomestik-web.vercel.app/en/admin
- Expected markers: /member member=true; /staff staff=true; /agent agent=false; /admin admin=false
- Observed markers: https://interdomestik-web.vercel.app/en/member => member=true, agent=false, staff=true, admin=false, notFound=false, rolesTable=false || https://interdomestik-web.vercel.app/en/staff => member=true, agent=false, staff=true, admin=false, notFound=false, rolesTable=false || https://interdomestik-web.vercel.app/en/agent => member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false || https://interdomestik-web.vercel.app/en/admin => member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S3 Agent elevation attempt -> admin resource

- Account used: agent
- URL(s): https://interdomestik-web.vercel.app/en/admin/users/golden_ks_staff
- Expected markers: (notFound=true OR admin=false) AND rolesTable=false
- Observed markers: member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S4 Staff elevation attempt -> agent portal

- Account used: staff
- URL(s): https://interdomestik-web.vercel.app/en/agent
- Expected markers: member=-, agent=false, staff=-, admin=-, notFound=-, rolesTable=-
- Observed markers: member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S5 Tenant override injection

- Account used: admin_ks
- URL(s): https://interdomestik-web.vercel.app/en/admin/users/golden_mk_admin?tenantId=tenant_mk
- Expected markers: notFound=true OR rolesTable=false
- Observed markers: source=env member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S6 Roles payload sanity (INFO only)

- Account used: agent
- URL(s): https://interdomestik-web.vercel.app/en/agent
- Expected markers: INFO capture if visible
- Observed markers: INFO: roles indicator not exposed
- Result: INFO

### S7 Admin != Staff

- Account used: admin_ks
- URL(s): https://interdomestik-web.vercel.app/en/staff
- Expected markers: member=-, agent=-, staff=false, admin=-, notFound=-, rolesTable=-
- Observed markers: member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S8 Admin != Agent

- Account used: admin_ks
- URL(s): https://interdomestik-web.vercel.app/en/agent
- Expected markers: member=-, agent=false, staff=-, admin=-, notFound=-, rolesTable=-
- Observed markers: member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

### S9 Staff != Agent (explicit pairwise)

- Account used: staff
- URL(s): https://interdomestik-web.vercel.app/en/agent
- Expected markers: member=-, agent=false, staff=-, admin=-, notFound=-, rolesTable=-
- Observed markers: member=false, agent=false, staff=false, admin=false, notFound=true, rolesTable=false
- Result: PASS

---

# P1 — Must-Pass Functionality

## P1.1 Member Evidence Upload Persistence

**Result:** PASS

Observed:

- member documents upload button count=6
- upload dialog opened=true
- upload file listed after submit=true
- after hard refresh listed=true
- after logout/login listed=true
- signed upload statuses: 200@[REDACTED_SIGNED_URL]

## P1.2 Member Evidence Download Works

**Result:** PASS

Observed:

- download response 200 observed=true
- download response statuses: 200@https://interdomestik-web.vercel.app/api/documents/95d56fed-4be1-4249-bced-af697bfcbf0d/download
- inline/open action succeeded=true

## P1.3 Staff Claim Update Persistence (Status + Note)

**Result:** PASS

Observed:

- staff_claims_list_url=https://interdomestik-web.vercel.app/en/staff/claims
- staff_page_ready_on_list=true
- claim_source=STAFF_CLAIM_URL_IGNORED_LIST
- fallback_search_elapsed_ms=8
- fallback_link_count=20
- claim_source=staff_claims_list
- claim_url=https://interdomestik-web.vercel.app/en/staff/claims/pack_ks_claim_ks_a_sla_2
- detail_not_found=false
- staff_page_ready_on_detail=false
- detail_ready=true action_panel_ready=true claim_section_ready=true
- status_change=Submitted -> Draft
- note persisted=true note="gate-note-1773673140734"
- status persisted=true expected="Draft" actual="Draft"

---

# P6 — RC Gate

## G07 Commercial Promise Surfaces

**Result:** PASS

Observed:

- scenario=pricing account=public missing=none observed=pricing-commercial-disclaimers=true,pricing-success-fee-calculator=true,pricing-billing-terms=true,pricing-coverage-matrix=true
- scenario=register account=public missing=none observed=register-success-fee-calculator=true,register-billing-terms=true,register-coverage-matrix=true
- scenario=services account=public missing=none observed=services-commercial-disclaimers=true,services-coverage-matrix=true
- scenario=membership account=member missing=none observed=membership-commercial-disclaimers=true,membership-coverage-matrix=true

## G08 Free Start And Group Privacy Boundaries

**Result:** PASS

Observed:

- scenario=free_start account=public missing_testids=none missing_phrases=none present_leaks=none observed=free-start-triage-note=true
- scenario=group_dashboard account=office_agent missing_testids=none missing_phrases=none present_leaks=none observed=group-dashboard-summary=true

## G09 Matter And SLA Enforcement

**Result:** PASS

Observed:

- scenario=member_running account=member missing_testids=none missing_phrases=none mismatches=none values=used:0|remaining:2|total:2 observed=member-claim-matter-allowance=true,member-claim-matter-allowance-used=true,member-claim-matter-allowance-remaining=true,member-claim-matter-allowance-total=true
- scenario=member_incomplete account=member missing_testids=none missing_phrases=none mismatches=none values=used:0|remaining:2|total:2 observed=member-claim-matter-allowance=true,member-claim-matter-allowance-used=true,member-claim-matter-allowance-remaining=true,member-claim-matter-allowance-total=true
- scenario=staff_running account=staff missing_testids=none missing_phrases=none mismatches=none values=used:0|remaining:2|total:2 observed=staff-claim-detail-ready=true,staff-claim-detail-matter-allowance=true,staff-claim-detail-matter-allowance-used=true,staff-claim-detail-matter-allowance-remaining=true,staff-claim-detail-matter-allowance-total=true
- scenario=staff_incomplete account=staff missing_testids=none missing_phrases=none mismatches=none values=used:0|remaining:2|total:2 observed=staff-claim-detail-ready=true,staff-claim-detail-matter-allowance=true,staff-claim-detail-matter-allowance-used=true,staff-claim-detail-matter-allowance-remaining=true,staff-claim-detail-matter-allowance-total=true

## G10 Escalation Agreement And Collection Fallback

**Result:** PASS

Observed:

- scenario=staff_unsigned_agreement account=staff missing_testids=none missing_prerequisites=none missing_phrases=none observed=staff-claim-detail-ready=true,staff-accepted-recovery-prerequisites=true,staff-escalation-agreement-summary=true,staff-success-fee-collection-summary=true prerequisites="accepted recovery prerequisites accepted recovery cannot move into negotiation or court until both prerequisites are ready. agreement missing collection path missing"
- scenario=staff_signed_deduction account=staff missing_testids=none missing_prerequisites=none missing_phrases=none observed=staff-claim-detail-ready=true,staff-accepted-recovery-prerequisites=true,staff-escalation-agreement-summary=true,staff-success-fee-collection-summary=true prerequisites="accepted recovery prerequisites accepted recovery cannot move into negotiation or court until both prerequisites are ready. agreement ready collection path ready"
- scenario=staff_payment_method_fallback account=staff missing_testids=none missing_prerequisites=none missing_phrases=none observed=staff-claim-detail-ready=true,staff-accepted-recovery-prerequisites=true,staff-escalation-agreement-summary=true,staff-success-fee-collection-summary=true prerequisites="accepted recovery prerequisites accepted recovery cannot move into negotiation or court until both prerequisites are ready. agreement ready collection path ready"
- scenario=staff_invoice_fallback account=staff missing_testids=none missing_prerequisites=none missing_phrases=none observed=staff-claim-detail-ready=true,staff-accepted-recovery-prerequisites=true,staff-escalation-agreement-summary=true,staff-success-fee-collection-summary=true prerequisites="accepted recovery prerequisites accepted recovery cannot move into negotiation or court until both prerequisites are ready. agreement ready collection path ready"

---

# P1.5 — Observability

## P1.5.1 Production Error Log Sweep (60m)

**Result:** PASS

Observed:

- log_mode=streaming-json
- deployment_ref=https://interdomestik-4oqnost9l-ecohub.vercel.app
- stream_window_ms=12000
- stream_timed_out=true
- runtime_entries=0
- runtime_non_noise_entries=0

---

# Verdict

## Final Status

- **GO**

## If NO-GO: Failing Signatures

- N/A

## Follow-ups / Tech Debt

- i18n coverage intentionally excluded from this gate; handled by nightly jobs.
