import { isSuperAdmin, ROLES } from '@interdomestik/shared-auth';

/** The existing people-page/action allowlist, also used by navigation. */
export const ADMIN_USER_ROLES: readonly string[] = [
  ROLES.admin,
  ROLES.tenant_admin,
  ROLES.super_admin,
];

export type AdminNavigationCapabilities = Readonly<{
  canAccessUsers: boolean;
  canReadAnalytics: boolean;
}>;

export function canAccessAdminUsers(role: string | null | undefined): boolean {
  return role != null && ADMIN_USER_ROLES.includes(role);
}

export function canReadAdminAnalytics(
  role: string | null | undefined,
  branchId?: string | null,
  hasAdminGrant = false
): boolean {
  if (role === ROLES.branch_manager) return Boolean(branchId?.trim());
  if (role === ROLES.member) return false;
  return canAccessAdminUsers(role) || hasAdminGrant;
}

export function canManagePlatformSettings(role: string | null | undefined): boolean {
  return isSuperAdmin(role);
}
