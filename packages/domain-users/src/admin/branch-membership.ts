import type { RoleGrant, RoleMutationTarget } from './role-target';

// Pilot branch membership is single-branch and lives in user.branchId. A branch-scoped grant may
// name only that branch, and a role mutation never moves a user to another branch; a transfer
// needs its own explicit operation.

/** Whether granting a role in `branchId` would give the user a second branch. */
export function conflictsWithBranchMembership(
  target: RoleMutationTarget,
  branchId: string
): boolean {
  if (target.branchId !== null && target.branchId !== branchId) return true;
  return target.grants.some(grant => grant.branchId !== null && grant.branchId !== branchId);
}

/**
 * Whether revoking `revoked` would leave a branch-scoped grant outside the user's branch, so the
 * remaining roles could move or contradict membership. Such a revoke fails closed.
 */
export function revokeLeavesForeignBranchGrant(
  target: RoleMutationTarget,
  revoked: RoleGrant
): boolean {
  return target.grants.some(
    grant =>
      !(grant.role === revoked.role && grant.branchId === revoked.branchId) &&
      grant.branchId !== null &&
      grant.branchId !== target.branchId
  );
}
