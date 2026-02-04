import type { RoleLike } from './roles.core';

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'tenant_admin', 'branch_manager']);

export function getCanonicalRouteForRole(role: RoleLike, locale: string): string | null {
  if (!role) return null;
  if (ADMIN_ROLES.has(role)) return `/${locale}/admin/overview`;
  if (role === 'staff') return `/${locale}/staff/claims`;
  if (role === 'agent') return `/${locale}/agent/members`;
  if (role === 'member' || role === 'user') return `/${locale}/member`;
  return null;
}

export function getPortalLabel(role: RoleLike): string {
  if (ADMIN_ROLES.has(role ?? '')) return 'Admin';
  if (role === 'staff') return 'Staff';
  if (role === 'agent') return 'Agent';
  return 'Member';
}
