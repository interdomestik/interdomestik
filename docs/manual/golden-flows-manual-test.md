# Golden Flows Manual Test Runbook

This runbook validates the "Golden Seed" dataset, ensuring that critical flows, RBAC isolation, and dashboards functions as expected across tenants (MK, KS) and branches.

## 1. Prerequisites

### Environment

- Local development environment or Staging
- Database seeded with `seed:golden`

### Setup

```bash
# 1. Reset and Seed Database
pnpm --filter @interdomestik/database seed:golden

# 2. Start Application
pnpm dev
```

## 2. Test Scenarios

### 2.1. Member Claim Visibility

**Actor:** Member (MK) `member.mk.1@interdomestik.com`
**Password:** `GoldenPass123!`

1. **Login** at `/login`
2. **Verify Dashboard:**
   - URL should be `/member`
   - Should see "Welcome" message
3. **Verify Claims:**
   - Navigate to `/member/claims`
   - **Expect to see:** "Rear ended in Skopje" (500.00 EUR)
   - **Expect to see:** "Broken Mirror" (150.00 EUR)
   - **Should NOT see:** "Towing Service" (200.00 EUR) - this belongs to Member 2

### 2.2. Tenant Isolation (KS vs MK)

**Actor:** Tenant Admin (KS) `admin.ks@interdomestik.com`
**Password:** `GoldenPass123!`

1. **Login** at `/login`
2. **Navigate** to `/admin/claims`
3. **Search** for "Skopje" or "Rear ended"
4. **Expect:** No results found. (Claims from MK tenant must be invisible)
5. **Verify Dashboard:**
   - Should verify "Kosovo" specific KPIs if available.

### 2.3. Branch Isolation (Branch A vs Branch B)

**Actor:** Branch Manager A (MK) `bm.mk.a@interdomestik.com`
**Password:** `GoldenPass123!`

1. **Login** at `/login`
2. **Navigate** to `/admin/claims` (or `/staff/claims` depending on routing)
3. **Expect to see:** "Rear ended in Skopje" (Branch A)
4. **Expect NOT to see:** "Towing Service" (Branch B)

### 2.4. Staff Claim Processing

**Actor:** Staff (MK) `staff.mk@interdomestik.com`
**Password:** `GoldenPass123!`

1. **Login** at `/login`
2. **Navigate** to `/staff/claims`
3. **Verify Visibility:**
   - Staff sees all claims in tenant_mk, regardless of branch.
   - **Expect to see:** "Rear ended in Skopje" (Branch A)
   - **Expect to see:** "Towing Service" (Branch B)
4. **Verify Deterministic Status Transition:**
   - Open claim "Rear ended in Skopje"
   - Change status from `Submitted` to `In Review` (or `Evaluation`)
   - **Expected Result:**
     - Status badge updates to `In Review` (or `Evaluation`)
     - Success toast/confirmation appears
     - No permission errors
5. **Verify Restrictions (Hard Rule):**
   - Navigate to `/admin/branches` -> **Expect:** 403 Forbidden or Redirect to Dashboard/Login
   - Navigate to `/admin/users` -> **Expect:** 403 Forbidden or Redirect to Dashboard/Login
   - _Staff must NOT be able to modify RBAC or create entities._
6. **Verify Negative Tenant Isolation:**
   - Search for "Kosovo" or claim from tenant_ks
   - **Expect:** 0 results

### 2.5. Agent Scoping

**Actor:** Agent A1 (MK) `agent.mk.a1@interdomestik.com`
**Password:** `GoldenPass123!`

1. **Login** at `/login`
2. **Navigate** to `/admin/claims` (or `/agent/claims`)
3. **Expect to see:** "Rear ended in Skopje" (Assigned Member 1)
4. **Expect NOT to see:** "Towing Service" (Member 2 is assigned to Agent A2)

### 2.6. Super Admin Global View

**Actor:** Super Admin `super@interdomestik.com`
**Password:** `GoldenPass123!`

1. **Login** at `/login`
2. **Navigate** to `/admin`
3. **Verify:**
   - Country/Tenant cards for "North Macedonia" and "Kosovo"
   - Total User counts should reflect seeded data.

## 3. Troubleshooting

- **404/403 Errors:** Check if the user has the correct `tenantId` and `role`.
- **Missing Claims:** Re-run `pnpm seed:golden`.
- **Login Failed:** Ensure `seed:golden` completed successfully (it seeds specific credential hashes).

## 4. Automation

These flows are automated in `apps/web/e2e/golden-flows.smoke.spec.ts`.
Run via:

```bash
pnpm smoke:golden
```

## Verification Summary

- **Refinement:** Updated Section 2.4 to enforce strict "Tenant-Wide" visibility for Staff, removing branch ambiguity.
- **Determinism:** Defined explicit status transition (Submitted -> In Review) with success criteria.
- **Security:** Hardened restriction checks for `/admin/branches` and `/admin/users` (403/Redirect).
- **Isolation:** Added negative test case ensuring Staff (MK) cannot see KS data.
- **Compliance:** Runbook is now fully deterministic and aligned with confirmed business logic.
