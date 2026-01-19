export const ADMIN_ALLOWED_ROLES = ['admin', 'super_admin', 'tenant_admin', 'branch_manager'];

export const ROLE_HOME_PATHS: Record<string, string> = {
  staff: '/staff',
  agent: '/agent',
  member: '/member',
  branch_manager: '/admin/dashboard', // Branch manager actually lives in admin dashboard usually
};

export function isAllowedInAdmin(role?: string | null): boolean {
  if (!role) return false;
  return ADMIN_ALLOWED_ROLES.includes(role);
}

export function getPortalHome(role?: string | null): string | null {
  if (!role) return null;
  return ROLE_HOME_PATHS[role] || null;
}
