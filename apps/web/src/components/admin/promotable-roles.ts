export function isPromotableToAgentRole(role: string | null | undefined): boolean {
  return role === 'user' || role === 'member' || role === 'staff';
}
