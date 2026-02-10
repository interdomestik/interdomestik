export const BRANCH_REQUIRED_ROLES = ['agent', 'branch_manager'] as const;

const BRANCH_REQUIRED_ROLE_SET = new Set<string>(BRANCH_REQUIRED_ROLES);

export function isBranchRequiredRole(role: string | null | undefined): boolean {
  const normalizedRole = role?.trim();
  return Boolean(normalizedRole && BRANCH_REQUIRED_ROLE_SET.has(normalizedRole));
}
