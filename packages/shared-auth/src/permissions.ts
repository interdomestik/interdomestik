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
  'support.cross_tenant_read': 'support.cross_tenant_read',
  'audit.read': 'audit.read',
  'break_glass.use': 'break_glass.use',
  'governance.approve': 'governance.approve',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Role hierarchy
export const ROLES = {
  super_admin: 'super_admin',
  admin: 'admin',
  tenant_admin: 'tenant_admin',
  global_support: 'global_support',
  auditor: 'auditor',
  branch_manager: 'branch_manager',
  staff: 'staff',
  agent: 'agent',
  member: 'member',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

type RolePermissions = Readonly<Record<Role, readonly Permission[]>>;

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
  PERMISSIONS['governance.approve'],
]);

const SUPER_ADMIN_PERMISSIONS: readonly Permission[] = Object.freeze([
  ...TENANT_ADMIN_PERMISSIONS.filter(
    permission => permission !== PERMISSIONS['governance.approve']
  ),
  PERMISSIONS['tenants.manage'],
  PERMISSIONS['support.cross_tenant_read'],
  PERMISSIONS['audit.read'],
  PERMISSIONS['break_glass.use'],
]);

// Permission matrix: which roles have which permissions
export const ROLE_PERMISSIONS: RolePermissions = Object.freeze({
  [ROLES.super_admin]: SUPER_ADMIN_PERMISSIONS,
  [ROLES.admin]: TENANT_ADMIN_PERMISSIONS,
  [ROLES.tenant_admin]: TENANT_ADMIN_PERMISSIONS,
  [ROLES.global_support]: Object.freeze([
    PERMISSIONS['members.read'],
    PERMISSIONS['claims.read'],
    PERMISSIONS['analytics.read'],
    PERMISSIONS['support.cross_tenant_read'],
  ]),
  [ROLES.auditor]: Object.freeze([PERMISSIONS['analytics.read'], PERMISSIONS['audit.read']]),
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
  return role === ROLES.admin || role === ROLES.tenant_admin;
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
