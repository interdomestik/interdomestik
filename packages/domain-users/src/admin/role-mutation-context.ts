import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';
import { canManageAssignedRole } from './role-rules';
import { resolveTenantId } from './utils';

export function resolveRoleMutationContext(
  params: { session: UserSession | null; tenantId?: string; role: string },
  operation: 'granted' | 'revoked'
): { session: UserSession; tenantId: string; role: string } | { error: string } {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);
  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };
  if (!canManageAssignedRole(session.user.role, role)) {
    return { error: `Role cannot be ${operation}` };
  }
  return { session, tenantId, role };
}
