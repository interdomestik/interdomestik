# Seed Verification Audit Report

**Date:** 2026-01-09
**Script:** `scripts/seed-platform-verification.mjs`
**Status:** ✅ Successfully Executed

---

## 1. Seed Summary Table

| Entity       | Count  | Details                                       |
| :----------- | :----- | :-------------------------------------------- |
| **Tenants**  | **2**  | `tenant_ks` (Kosovo), `tenant_mk` (Macedonia) |
| **Branches** | **4**  | 2 per Tenant (Capital + Secondary City)       |
| **Users**    | **41** | See breakdown below                           |
| **Claims**   | **22** | Mix of drafts, submitted, resolved            |

### User Breakdown

| Role               | Count | Context                          |
| :----------------- | :---- | :------------------------------- |
| **Super Admin**    | 1     | Global Scope (Home: `tenant_mk`) |
| **Tenant Admin**   | 2     | 1 per Tenant                     |
| **Staff**          | 2     | 1 per Tenant (Ops)               |
| **Branch Manager** | 4     | 1 per Branch (Strictly Scoped)   |
| **Agents**         | 8     | 2 per Branch                     |
| **Members**        | 24    | 3 per Agent                      |

---

## 2. Dashboard Validation Checklist

Use these credentials to verify dashboards.
**Password for all:** `VerifyPassword123!`

### A. Super Admin (`super@verify.com`)

- [ ] Verify both `Interdomestik Kosovo` and `Interdomestik Macedonia` are visible.
- [ ] Verify global KPIs sum up all branches.

### B. Tenant Admin KS (`admin.tenant_ks@verify.com`)

- [ ] Verify **ONLY** `Prishtina Branch` and `Prizren Branch` are visible.
- [ ] Verify **NO** Macedonia branches explicitly.
- [ ] Verify ability to Create Agent (UI pending).

### C. Branch Manager Prishtina (`manager.branch_ks_a@verify.com`)

- [ ] Verify **ONLY** `Prishtina Branch` stats.
- [ ] Verify **NO** access to Prizren data.
- [ ] Verify `Agent PR 1` and `Agent PR 2` are visible.

### D. Ops Staff KS (`staff.tenant_ks@verify.com`)

- [ ] Verify Claims Queue shows claims from **BOTH** Prishtina and Prizren.
- [ ] Verify **NO** access to "Create Branch" or "Create Agent".

---

## 3. Known Limitations

1.  **Strict IDs**: This seed uses hardcoded IDs (e.g., `audit_log` cleanup relies on them). Do not rename entities without updating cleanup logic.
2.  **Passwords**: Deterministic password `VerifyPassword123!` is used for all users to facilitate manual verification.

## 4. Safety Check

- **RBAC**: Roles are explicitly assigned. No "default" role fallback used.
- **Isolation**: Cross-tenant data is physically separated by `tenant_id` columns in seed.
- **Privilege**: Super Admin is assigned a home tenant (`tenant_mk`) to satisfy DB constraints but retains `super_admin` role for cross-tenant logic.

---

**End of Report**
