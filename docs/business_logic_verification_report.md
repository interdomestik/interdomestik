# Business Logic Verification Report

**Date:** 2026-01-09
**Auditor Role:** Principal Product Engineer
**Scope:** RBAC Constraints, Server Actions, UI Entry Points

---

## 📊 Final Verdict: ❌ Not Compliant

**Assessment:**
The platform **FAILS** to meet the critical business requirements for **Tenant Admin** management capabilities. While constraints are mostly respected, the _positive_ requirements (Must Create X) are functionally missing from the UI and partially obscured in the backend.

---

## 1. ⚠️ Violations / Gaps

### 🛑 BLOCKER: Missing Management Features (Tenant Admin)

**Violation:** Tenant Admin MUST Create/edit branches and agents.

- **File:** `apps/web/src/app/[locale]/admin/branches/`
- **Evidence:** Directory exists but has no `page.tsx`. Directly navigating to `/admin/branches` results in **404**. No UI exists to list or create branches.
- **File:** `apps/web/src/components/admin/users-sections.tsx`
- **Evidence:** The Users list component (`UsersSections`) displays users but **lacks any "Add Agent" or "Add User" button**.
- **Impact:** The platform is operationally paralyzed; new branches or agents cannot be onboarded by Tenant Admins.

### ⚠️ HIGH: Inconsistent Action Security (Staff/Admin)

**Violation:** Security relies on legacy domain logic rather than standardized guards.

- **File:** `apps/web/src/actions/admin-users.core.ts`
- **File:** `apps/web/src/actions/admin-rbac.core.ts`
- **Evidence:** These critical actions (`createBranch`, `updateUserAgent`) **bypass** the `runAuthenticatedAction` wrapper (used by newer features like Country Guidance). They manually fetch session context (`getActionContext`), missing standard Tenancy/Sentry/RBAC-Invariant enforcement layers.
- **Impact:** High risk of drift. If domain logic allows it, a specific permission check might be missed.

### ⚠️ MEDIUM: Configuration vs. Logic Mismatch (Branch Manager)

**Violation:** Config grants permissions that Business Logic explicitly forbids.

- **File:** `packages/shared-auth/src/permissions.ts` (Line 47)
- **Evidence:** Grants `claims.update` to `branch_manager`.
- **Business Logic:** "Branch Manager... ❌ NOT handle claims lifecycle".
- **Mitigation:** `packages/domain-claims/src/claims/status.ts` (Line 35) explicitly restricts updates to `staff` or `admin`.
- **Impact:** Logic is currently safe, but the loose permission config creates a latent risk if a developer relies solely on `hasPermission()`.

---

## 2. ✅ Confirmed Correct

- **Agent Isolation**: Agents are correctly restricted. They lack `claims.update` permission and `safe-action.ts` enforces `actorAgentId` context.
- **Branch Manager Scoping**: `safe-action.ts` correctly enforces `branchId` context for Branch Managers via `validateBranchManagerInvariant`. This prevents cross-branch visibility.
- **Staff Claim Ops**: Staff are correctly identified in `roles.core.ts` and allowed to operate on claims via the domain logic check.

---

## 3. 🛠️ Required Fixes

### 1. Implement Tenant Management UI (Priority: Critical)

- **Create Page:** `apps/web/src/app/[locale]/admin/branches/page.tsx` with a `BranchesTable` and `CreateBranchDialog`.
- **Update Component:** Add `CreateUserDialog` trigger to `UsersSections` in `apps/web/src/components/admin/users-sections.tsx`.

### 2. Standardize Server Actions (Priority: High)

- Refactor `admin-users.core.ts` and `admin-rbac.core.ts` to use `runAuthenticatedAction`.
- **Benefit:** strict checks for `ensureTenantId` and consistent Sentry tags.

### 3. Tighten Permissions (Priority: Medium)

- Remove `PERMISSIONS['claims.update']` from `branch_manager` in `packages/shared-auth/src/permissions.ts` to align config with business constraints.

---

**End of Report**
