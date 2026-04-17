type ClaimScopeRecord = {
  branchId?: string | null;
  staffId?: string | null;
};

const FULL_TENANT_CLAIMS_ROLES = new Set(['admin', 'tenant_admin', 'super_admin']);

export function canAccessClaimFromAdminUploadSurface(args: {
  branchId?: string | null;
  claim: ClaimScopeRecord;
  role: string | null | undefined;
  userId: string;
}): boolean {
  const { claim, role, userId } = args;
  const branchId = args.branchId ?? null;

  if (!role) {
    return false;
  }

  if (FULL_TENANT_CLAIMS_ROLES.has(role)) {
    return true;
  }

  if (role === 'branch_manager') {
    return branchId !== null && claim.branchId === branchId;
  }

  if (role !== 'staff') {
    return false;
  }

  if (branchId !== null) {
    return claim.branchId === branchId;
  }

  return claim.staffId === userId || claim.staffId == null;
}
