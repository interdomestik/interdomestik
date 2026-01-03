/**
 * RBAC Permission System
 * Phase 2: Tenant + Branch + Agent scoping
 */

// Permission constants
export const PERMISSIONS = {
  // Members
  'members.read': 'members.read',
  'members.write': 'members.write',
  // Claims
  'claims.read': 'claims.read',
  'claims.update': 'claims.update',
  'claims.assign': 'claims.assign',
  // Roles & Branches
  'roles.manage': 'roles.manage',
  'branches.manage': 'branches.manage',
  // Admin
  'analytics.read': 'analytics.read',
  'settings.manage': 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Role hierarchy
export const ROLES = {
  super_admin: 'super_admin',
  admin: 'admin',
  tenant_admin: 'tenant_admin',
  branch_manager: 'branch_manager',
  staff: 'staff',
  agent: 'agent',
  member: 'member',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Permission matrix: which roles have which permissions
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS), // Legacy admin treated as super_admin
  tenant_admin: Object.values(PERMISSIONS),
  branch_manager: [
    PERMISSIONS['members.read'],
    PERMISSIONS['members.write'],
    PERMISSIONS['claims.read'],
    PERMISSIONS['claims.update'],
    PERMISSIONS['analytics.read'],
  ],
  staff: [
    PERMISSIONS['members.read'],
    PERMISSIONS['claims.read'],
    PERMISSIONS['claims.update'],
    PERMISSIONS['claims.assign'],
  ],
  agent: [PERMISSIONS['members.read'], PERMISSIONS['claims.read']],
  member: [],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string | null | undefined): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

/**
 * Check if role is super_admin (cross-tenant)
 */
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === ROLES.super_admin;
}

/**
 * Check if role is tenant-level admin
 */
export function isTenantAdmin(role: string | null | undefined): boolean {
  return role === ROLES.tenant_admin || role === ROLES.super_admin;
}

/**
 * Check if role is staff or higher
 */
export function isStaffOrHigher(role: string | null | undefined): boolean {
  return (
    role === ROLES.super_admin ||
    role === ROLES.tenant_admin ||
    role === ROLES.branch_manager ||
    role === ROLES.staff
  );
}
