# Full System Seed - Manual Verification Map

This document serves as the "Source of Truth" for manually verifying the **Full System Seed**.
Run command: `pnpm --filter @interdomestik/database seed:full`
Password for ALL users: `FullSeedPass123!`

---

## 1. Credentials Matrix

| Role                | Email                           | User ID              | Context       | Expected Access                                                  |
| ------------------- | ------------------------------- | -------------------- | ------------- | ---------------------------------------------------------------- |
| **Super Admin**     | `super@interdomestik.com`       | `golden_super_admin` | Global        | Complete visibility of all tenants, branches, and dashboards.    |
| **MK Tenant Admin** | `admin.mk@interdomestik.com`    | `golden_mk_admin`    | Tenant (MK)   | Can manage MK branches, agents, staff. Cannot access KS data.    |
| **KS Tenant Admin** | `admin.ks@interdomestik.com`    | `golden_ks_admin`    | Tenant (KS)   | Can manage KS branches, agents, staff. Cannot access MK data.    |
| **MK Staff**        | `staff.mk@interdomestik.com`    | `golden_mk_staff`    | Tenant (MK)   | **Ops Only**. Can managing claims. Cannot edit settings/users.   |
| **MK Manager A**    | `bm.mk.a@interdomestik.com`     | `golden_mk_bm_a`     | Branch A (MK) | View Branch A KPIs. Verify Cash Leads in Branch A.               |
| **MK Manager B**    | `bm.mk.b@interdomestik.com`     | `golden_mk_bm_b`     | Branch B (MK) | View Branch B KPIs. Cannot see Branch A claims/leads.            |
| **MK Agent A1**     | `agent.mk.a1@interdomestik.com` | `golden_mk_agent_a1` | Branch A (MK) | View assigned members (1, 2, 3). Create leads. View commissions. |

---

## 2. Dashboard Verification (KPIs)

### Super Admin Dashboard (`/admin`)

- **Total Revenue**: Sum of all active subs + commissions + lead payments.
- **Tenants**: 2 (North Macedonia, Kosovo).

### MK Admin Dashboard (`/admin` - Context MK)

- **Active Members**: 7 (Members 1, 4, 5, 6, 7, 8, 9) + 2 Converted Leads = **9 Total**.
- **Members needing attention**: 1 Past Due (Member 3).
- **Churned**: 1 Canceled (Member 2).

### KS Admin Dashboard (`/admin` - Context KS)

- **Active Members**: 7 (Members 1, 4, 5, 6, 7, 8, 9).
- **Past Due**: 1 (Member 3).
- **Canceled**: 1 (Member 2).

---

## 3. Visibility & Isolation Checks

### Claims visibility

| Login As         | Navigate To     | Expect to SEE                                                             | Expect NOT TO SEE                            |
| ---------------- | --------------- | ------------------------------------------------------------------------- | -------------------------------------------- |
| **MK Staff**     | `/admin/claims` | `Fender Bender Skopje`, `Broken Windshield`, `Hail Damage` (Members 1, 4) | Any KS claims (`Pristina Parking Bump`)      |
| **MK Manager A** | `/admin/claims` | Claims for Branch A (`Fender Bender`, `Broken Windshield`)                | Claims for Branch B (`Suspicious Collision`) |
| **KS Staff**     | `/admin/claims` | `Pristina Parking Bump` (Member 1), `Prizren Towing`                      | Any MK claims                                |

### Balkan Agent Flow

| Login As         | Navigate To    | Expect Data                                                   |
| ---------------- | -------------- | ------------------------------------------------------------- |
| **MK Agent A1**  | `/agent/leads` | **2 Converted Leads**: `Balkan CashLead` & `Balkan CardLead`. |
| **MK Manager A** | `/admin/leads` | Verify ability to see `Balkan CashLead` transaction log.      |

---

## 4. Specific Data Points to Verify

1.  **Claim Documents**:
    - Login as **MK Staff**. Open claim `Fender Bender Skopje` (ID: `full_claim_mk_1`).
    - Verify "Documents" tab shows `Police Report.pdf` (Placeholder).

2.  **Commissions**:
    - Login as **MK Agent A1**.
    - Navigate to `/agent/commissions`.
    - Expect commissions for Members 1.
    - Expect mixed status (Paid/Pending).

3.  **Subscriptions**:
    - Login as **MK Admin**.
    - Search for user `member.mk.2` (ID: `golden_mk_member_2`).
    - Verify Status is **Canceled**.
