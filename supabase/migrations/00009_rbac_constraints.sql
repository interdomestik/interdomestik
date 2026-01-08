-- Migration: 00009_rbac_constraints.sql
-- Description: Enforce RBAC invariants on the user table to prevent privilege bleed.

-- 1. Staff and Tenant Admins MUST NOT be scoped to a specific branch in the DB.
-- This ensures they always inherit tenant-wide access unless implementation changes (not currently supported).
ALTER TABLE "user" 
ADD CONSTRAINT "check_staff_no_branch" 
CHECK (
  (role NOT IN ('staff', 'tenant_admin')) OR (branch_id IS NULL)
);

-- 2. Branch Managers MUST have a branch_id.
-- A branch manager without a branch is effectively useless or dangerous (could fallback to tenant-wide).
ALTER TABLE "user" 
ADD CONSTRAINT "check_bm_has_branch" 
CHECK (
  (role != 'branch_manager') OR (branch_id IS NOT NULL)
);

-- Note: We do NOT enforce agent_id constraints here because:
-- 1. 'agent' role users might refer other members (upstream agentId)?
-- 2. 'agent' role identity is grounded in the 'id' column (Self), not the 'agentId' (Referred By) column.
