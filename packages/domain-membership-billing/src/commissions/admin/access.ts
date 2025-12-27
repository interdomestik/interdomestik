import type { CommissionSession } from '../types';

export type AdminAuthError = { success: false; error: string };

export function ensureAdmin(session: CommissionSession | null): AdminAuthError | null {
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (session.user.role !== 'admin') return { success: false, error: 'Admin access required' };
  return null;
}
