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
  'tenants.manage': 'tenants.manage',
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

type RolePermissions = Readonly<Record<Role, readonly Permission[]>>;

const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(Object.values(PERMISSIONS));

const TENANT_ADMIN_PERMISSIONS: readonly Permission[] = Object.freeze([
  PERMISSIONS['members.read'],
  PERMISSIONS['members.write'],
  PERMISSIONS['claims.read'],
  PERMISSIONS['claims.update'],
  PERMISSIONS['claims.assign'],
  PERMISSIONS['roles.manage'],
  PERMISSIONS['branches.manage'],
  PERMISSIONS['analytics.read'],
  PERMISSIONS['settings.manage'],
]);

// Permission matrix: which roles have which permissions
export const ROLE_PERMISSIONS: RolePermissions = Object.freeze({
  [ROLES.super_admin]: ALL_PERMISSIONS,
  [ROLES.admin]: TENANT_ADMIN_PERMISSIONS,
  [ROLES.tenant_admin]: TENANT_ADMIN_PERMISSIONS,
  [ROLES.branch_manager]: Object.freeze([
    PERMISSIONS['members.read'],
    PERMISSIONS['members.write'],
    PERMISSIONS['claims.read'],
    PERMISSIONS['analytics.read'],
  ]),
  [ROLES.staff]: Object.freeze([
    PERMISSIONS['members.read'],
    PERMISSIONS['claims.read'],
    PERMISSIONS['claims.update'],
    PERMISSIONS['claims.assign'],
  ]),
  [ROLES.agent]: Object.freeze([PERMISSIONS['members.read'], PERMISSIONS['claims.read']]),
  [ROLES.member]: Object.freeze([]),
});

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role] as readonly Permission[] | undefined;
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string | null | undefined): Permission[] {
  if (!role) return [];
  return [...(ROLE_PERMISSIONS[role as Role] ?? [])];
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
  return role === ROLES.admin || role === ROLES.tenant_admin || role === ROLES.super_admin;
}

/**
 * Check if role is staff or higher
 */
export function isStaffOrHigher(role: string | null | undefined): boolean {
  return (
    role === ROLES.super_admin ||
    role === ROLES.admin ||
    role === ROLES.tenant_admin ||
    role === ROLES.branch_manager ||
    role === ROLES.staff
  );
}
