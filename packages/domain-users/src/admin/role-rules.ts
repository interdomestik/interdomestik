export const BRANCH_REQUIRED_ROLES = ['agent', 'branch_manager'] as const;

// ADR-09: both admin aliases carry tenant governance, not platform authority.
const TENANT_MANAGED_ROLES = new Set([
  'admin',
  'tenant_admin',
  'branch_manager',
  'staff',
  'agent',
  'member',
  'promoter',
]);
const PLATFORM_ROLES = new Set(['super_admin', 'global_support', 'auditor']);

export function canManageAssignedRole(actorRole: string, assignedRole: string): boolean {
  if (actorRole === 'super_admin') {
    return PLATFORM_ROLES.has(assignedRole) || TENANT_MANAGED_ROLES.has(assignedRole);
  }
  return (
    (actorRole === 'admin' || actorRole === 'tenant_admin') &&
    TENANT_MANAGED_ROLES.has(assignedRole)
  );
}

export function canManageExistingRoles(
  actorRole: string,
  existingRoles: readonly string[]
): boolean {
  return actorRole === 'super_admin' || !existingRoles.some(role => PLATFORM_ROLES.has(role));
}

const BRANCH_REQUIRED_ROLE_SET = new Set<string>(BRANCH_REQUIRED_ROLES);

export function isBranchRequiredRole(role: string | null | undefined): boolean {
  const normalizedRole = role?.trim();
  return Boolean(normalizedRole && BRANCH_REQUIRED_ROLE_SET.has(normalizedRole));
}
