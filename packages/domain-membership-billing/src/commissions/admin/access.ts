import type { CommissionSession } from '../types';

export type AdminAuthError = { success: false; error: string };

const ADMIN_ROLES = new Set(['admin', 'tenant_admin', 'super_admin']);

function isAdminRole(role: string | null | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

export function ensureAdmin(session: CommissionSession | null): AdminAuthError | null {
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdminRole(session.user.role)) return { success: false, error: 'Admin access required' };
  return null;
}

export function ensureAdminOrStaff(session: CommissionSession | null): AdminAuthError | null {
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdminRole(session.user.role) && session.user.role !== 'staff') {
    return { success: false, error: 'Admin or staff access required' };
  }
  return null;
}
