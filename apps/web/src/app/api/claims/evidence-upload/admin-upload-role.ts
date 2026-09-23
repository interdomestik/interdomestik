import { isBranchManager, isStaffOrAdmin } from '@/lib/roles.core';

export function isAdminUploadRole(role: string | null | undefined): boolean {
  return isStaffOrAdmin(role) || isBranchManager(role);
}
