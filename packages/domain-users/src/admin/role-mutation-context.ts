import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';
import { canManageAssignedRole } from './role-rules';
import { resolveTenantAuthority } from './utils';

export async function resolveRoleMutationContext(
  params: {
    session: UserSession | null;
    authority: TenantAuthority | null;
    role: string;
  },
  operation: 'granted' | 'revoked'
): Promise<
  | { session: UserSession; authority: TenantAuthority; tenantId: string; role: string }
  | { error: string }
> {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const authority = await resolveTenantAuthority(session, params.authority);
  const { tenantId } = readTenantAuthority(authority);
  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };
  if (!canManageAssignedRole(session.user.role, role)) {
    return { error: `Role cannot be ${operation}` };
  }
  return { session, authority, tenantId, role };
}
