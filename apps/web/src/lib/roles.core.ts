export type RoleLike = string | null | undefined;

export const ROLE_SUPER_ADMIN = 'super_admin' as const;
export const ROLE_TENANT_ADMIN = 'tenant_admin' as const;
export const ROLE_STAFF = 'staff' as const;
export const ROLE_BRANCH_MANAGER = 'branch_manager' as const;
export const ROLE_AGENT = 'agent' as const;
export const ROLE_PROMOTER = 'promoter' as const;
export const ROLE_MEMBER = 'member' as const;

export function isMember(role: RoleLike): boolean {
  return role === 'user' || role === ROLE_MEMBER;
}

export function isStaff(role: RoleLike): boolean {
  return role === 'staff';
}

export function isAdmin(role: RoleLike): boolean {
  return role === 'admin' || role === ROLE_TENANT_ADMIN || role === ROLE_SUPER_ADMIN;
}

export function isStaffOrAdmin(role: RoleLike): boolean {
  return role === 'staff' || isAdmin(role);
}

export function isSuperAdmin(role: RoleLike): boolean {
  return role === ROLE_SUPER_ADMIN;
}

export function isTenantAdmin(role: RoleLike): boolean {
  return role === ROLE_TENANT_ADMIN || isSuperAdmin(role);
}

export function isBranchManager(role: RoleLike): boolean {
  return role === ROLE_BRANCH_MANAGER || isTenantAdmin(role);
}

export function isAgent(role: RoleLike): boolean {
  return role === ROLE_AGENT;
}

export function isPromoter(role: RoleLike): boolean {
  return role === ROLE_PROMOTER;
}
