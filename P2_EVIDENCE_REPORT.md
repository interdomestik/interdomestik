# Interdomestik v3 Pilot P2 Evidence Report (P2.1–P2.5)

Generated (UTC): 2026-02-13T18:13:51Z

## Environment

- Alias URL: https://interdomestik-web.vercel.app
- Deployment ID: dpl_2oEiHSbsg9RbQrkmCMbRAqb6LtWG
- Deployment URL: https://interdomestik-88xscc5sc-ecohub.vercel.app
- Evidence bundle dirs:
  - Bundle A: `tmp/pilot-evidence/p2/20260213-180344/`
  - Bundle B: `tmp/pilot-evidence/p2/20260213-175139/`
  - Note: bundle timestamps were created using different clock sources (local vs UTC) during capture; treat them as IDs, not strict ordering.

## Accounts Used (Masked)

Tenant: `tenant_ks`

- Member A (P2-A): `p2-a-20260213-20260213171226@interdomestik.com`
- Member B (P2-B): `p2-b-20260213-20260213171226@interdomestik.com`
- Member C (P2-C): `p2-c-20260213-20260213171226@interdomestik.com`
- Agent1: `agent.ks.a1@interdomestik.com`
- Staff1: `staff.ks.2@interdomestik.com`
- Admin: `admin.ks@interdomestik.com`

Clean pin (gate member): `member.ks.a2@interdomestik.com`
Tainted (do not use): `member.ks.a1@interdomestik.com`

## Test Data

- Claim under test: `pJa_mHrqdX_idSuJOtVcB`
- Claim title: `P2 Claim NoEvidence 2026-02-13`
- Member: `P2-A-2026-02-13`

## P2.4 Document Lifecycle (Upload -> List -> Download)

### Steps Executed

1. Member portal documents page initially showed no upload controls when no claim existed.
2. Created claim (no evidence at submission), then verified member documents page shows upload control.
3. Uploaded small PDF as Member A.
4. Refreshed page: document persists.
5. Logged out/in: document persists.
6. Downloaded: verified response headers are PDF, not HTML.
7. Staff portal: verified documents list + download control present on staff claim detail (no upload control found).
8. Agent portal: verified claim visibility; no document upload control found in agent surfaces used (needs explicit confirmation of intended upload path).

### Status

- Member upload/list/download: **PASS**
- Staff upload: **N/A** (no upload control present; list/download exists)
- Agent upload: **N/A** (no upload control found in current agent UI)

### Evidence Table

| URL                                                                          | Expected                                    | Actual                     | Proof                                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `https://interdomestik-web.vercel.app/en/member/documents`                   | Upload control visible (for existing claim) | Visible after claim exists | `tmp/pilot-evidence/p2/20260213-180344/screens/p2-20260213-180344-member-documents-listed.png`             |
| `https://interdomestik-web.vercel.app/en/member/documents`                   | After refresh, file still listed            | Listed                     | `tmp/pilot-evidence/p2/20260213-180344/screens/p2-20260213-180344-member-documents-after-refresh.png`      |
| `https://interdomestik-web.vercel.app/en/member/documents`                   | After relogin, file still listed            | Listed                     | `tmp/pilot-evidence/p2/20260213-180344/screens/p2-20260213-180344-member-documents-after-relogin.png`      |
| `/api/documents/<docId>/download`                                            | Content-Type PDF, not HTML                  | `application/pdf`          | `tmp/pilot-evidence/p2/20260213-180344/network/member_download_headers.json`                               |
| `https://interdomestik-web.vercel.app/en/staff/claims/pJa_mHrqdX_idSuJOtVcB` | Documents tab shows list + download         | Present                    | `tmp/pilot-evidence/p2/20260213-175139/screens/p23-staff-after-status-update-2026-02-13T18-04-43-890Z.png` |

### Notes / Issues

- Observed production error log during download: `Audit log failed: Missing tenantId for action: document.download`.
  - Log excerpt: `tmp/pilot-evidence/p2/20260213-175139/logs/vercel_logs_errors_30m_after_p23.jsonl`
  - Fix implemented in this branch: pass `tenantId` to audit logger in `GET /api/documents/[id]/download`.

## P2.1 Member Creates Claim; Visibility Across Agent/Staff/Admin

### Steps Executed

1. Member A created a claim (`pJa_mHrqdX_idSuJOtVcB`).
2. Member A can see claim in list and open claim detail.
3. Agent1 can see claims list (includes Member A claim).
4. Staff1 can see claims queue.
5. Admin can open claim detail.

### Status

**PASS** (visibility confirmed across member/agent/staff/admin).

### Evidence Table

| URL                                                                           | Expected               | Actual  | Proof                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `https://interdomestik-web.vercel.app/en/member/claims`                       | Claim appears          | Visible | `tmp/pilot-evidence/p2/20260213-175139/screens/p21-member-claims-list-2026-02-13T18-04-06-944Z.png`  |
| `https://interdomestik-web.vercel.app/en/member/claims/pJa_mHrqdX_idSuJOtVcB` | Claim detail loads     | Loads   | `tmp/pilot-evidence/p2/20260213-175139/screens/p21-member-claim-detail-2026-02-13T18-04-10-241Z.png` |
| `https://interdomestik-web.vercel.app/en/agent/claims`                        | Claim visible to agent | Loads   | `tmp/pilot-evidence/p2/20260213-175139/screens/p21-agent-claims-list-2026-02-13T18-04-33-205Z.png`   |
| `https://interdomestik-web.vercel.app/en/staff/claims`                        | Claim visible to staff | Loads   | `tmp/pilot-evidence/p2/20260213-175139/screens/p21-staff-claims-list-2026-02-13T18-04-37-426Z.png`   |
| `https://interdomestik-web.vercel.app/en/admin/claims/pJa_mHrqdX_idSuJOtVcB`  | Claim visible to admin | Loads   | `tmp/pilot-evidence/p2/20260213-175139/screens/p21-admin-claim-detail-2026-02-13T18-04-54-988Z.png`  |

### Log Gate

- Captured: `tmp/pilot-evidence/p2/20260213-175139/logs/vercel_logs_errors_30m_after_p23.txt`
- Contains an i18n missing-message error (see P2.3).

## P2.2 Admin/Branch Manager Assigns Staff/Agent to Claim

### Steps Executed

- Assignment UI exists in Admin Ops Center (staff assignment via reassign control), and Staff can self-assign via Staff Actions.
- Staff self-assign was exercised as part of P2.3 run.

### Status

**PASS** (Admin assigned claim in Ops Center; persistence captured via updated Ops header.)

### Evidence Table

| URL                                                                          | Expected                          | Actual                                    | Proof                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `https://interdomestik-web.vercel.app/en/staff/claims/pJa_mHrqdX_idSuJOtVcB` | "Assign to me" works and persists | Action available; status update succeeded | `tmp/pilot-evidence/p2/20260213-175139/screens/p23-staff-after-status-update-2026-02-13T18-04-43-890Z.png` |
| `https://interdomestik-web.vercel.app/en/admin/claims/pJa_mHrqdX_idSuJOtVcB` | Admin can assign owner            | Assigned to Arber Krasniqi                | `tmp/pilot-evidence/p2/20260213-184125/screens/p22-admin-claim-after-assign-2026-02-13T18-57-25-008Z.png`  |

## P2.3 Staff Updates Claim Status/Note; Member Sees Update

### Steps Executed

1. Staff opened claim detail.
2. Staff set status to `evaluation` and added a note.
3. Member opened claim detail and saw updated status and note in timeline.

### Status

**PASS** (functional), but **LOG-GATE FAIL** due to i18n error in production logs.

### Evidence Table

| URL                                                                           | Expected                     | Actual               | Proof                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `https://interdomestik-web.vercel.app/en/staff/claims/pJa_mHrqdX_idSuJOtVcB`  | Staff can update status/note | Updated successfully | `tmp/pilot-evidence/p2/20260213-175139/screens/p23-staff-after-status-update-2026-02-13T18-04-43-890Z.png`  |
| `https://interdomestik-web.vercel.app/en/member/claims/pJa_mHrqdX_idSuJOtVcB` | Member sees status + note    | Visible in timeline  | `tmp/pilot-evidence/p2/20260213-175139/screens/p23-member-after-status-update-2026-02-13T18-04-48-646Z.png` |

### Notes / Issues

- Production error log: `MISSING_MESSAGE: claims.claims-tracking.status.evaluation (en)`.
  - Root cause: timeline event labelKey is fully-qualified `claims-tracking.status.*` but UI translated it inside the `claims` namespace.
  - Fix implemented in this branch: translate via `claims-tracking.status` namespace.

## P2.5 Role Grant/Revoke Access Flip (incl. Branch-Required Roles)

### Steps Executed

- Admin user profile roles panel exists and enforces tenant context + branch-required roles.
- Evidence capture includes admin users search screen.

### Status

**PARTIAL** (UI presence captured; grant/revoke flip still needs manual execution + screenshots in production after deploy).

### Evidence Table

| URL                                                                                                           | Expected                           | Actual            | Proof                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `https://interdomestik-web.vercel.app/en/admin/users?search=p2-b-20260213-20260213171226%40interdomestik.com` | Can locate test user for role flip | Search page loads | `tmp/pilot-evidence/p2/20260213-175139/screens/p25-admin-users-search-2026-02-13T18-04-59-602Z.png` |

## Final GO/NO-GO

**NO-GO** until redeploy + re-run log gates in production, because production error logs include:

1. Audit log missing tenantId on document download
2. i18n missing message error on member claim timeline rendering

Both are fixed in this branch with unit tests; re-run P2 log gates after deployment.

## Post-Deploy Verification (After PR Merge)

Production alias was redeployed from merged `main` and now points to:

- Alias: `https://interdomestik-web.vercel.app`
- Deployment ID: `dpl_2oEiHSbsg9RbQrkmCMbRAqb6LtWG`
- Deployment URL: `https://interdomestik-88xscc5sc-ecohub.vercel.app`
- Probe evidence dir: `tmp/pilot-evidence/p2/20260213-184125/`

Post-deploy probes executed:

- Member claim detail loads and timeline renders: `tmp/pilot-evidence/p2/20260213-184125/screens/postdeploy-member-claim-2026-02-13T18-54-20-396Z.png`
- Authenticated document download returns PDF headers and PDF magic bytes: `tmp/pilot-evidence/p2/20260213-184125/network/postdeploy-doc-download-headers-2026-02-13T18-54-21-624Z.json`
- Log gate after probes: `tmp/pilot-evidence/p2/20260213-184125/logs/vercel_logs_errors_30m_after_postdeploy_probe.jsonl` (0 errors)
