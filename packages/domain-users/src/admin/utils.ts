import { ensureTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

export function resolveTenantId(session: UserSession, requestedTenantId?: string | null): string {
  if (requestedTenantId) {
    if (session.user.role === 'super_admin') return requestedTenantId;

    // Non-super-admin users may only operate within their current tenant.
    if (session.user.tenantId && session.user.tenantId === requestedTenantId) {
      return requestedTenantId;
    }

    throw new Error('Unauthorized');
  }

  return ensureTenantId(session);
}
