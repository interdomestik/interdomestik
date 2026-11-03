import { delegateSuperAdminTenant } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureAccessTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

export function resolveTenantId(session: UserSession, requestedTenantId?: string | null): string {
  if (requestedTenantId) {
    if (session.user.role === 'super_admin') return requestedTenantId;

    // Non-super-admin users may only operate within their current tenant.
    if (ensureAccessTenantId(session) === requestedTenantId) {
      return requestedTenantId;
    }

    throw new Error('Unauthorized');
  }

  return ensureAccessTenantId(session);
}

/**
 * The tenant authority an admin action runs under. Without a requested tenant (or naming the
 * caller's own tenant) it is the caller's session authority. Naming another tenant is a
 * super_admin delegation, minted by the database producer only for an active tenant. The
 * authority must belong to the session's user; anything else fails closed as Unauthorized.
 */
export async function resolveTenantAuthority(
  session: UserSession,
  authority: TenantAuthority | null | undefined,
  requestedTenantId?: string | null
): Promise<TenantAuthority> {
  if (!authority) throw new Error('Unauthorized');
  const descriptor = readTenantAuthority(authority);
  if (descriptor.principal?.userId !== session.user.id) throw new Error('Unauthorized');

  const requested = requestedTenantId?.trim();
  if (!requested || requested === descriptor.tenantId) return authority;
  if (session.user.role !== 'super_admin') throw new Error('Unauthorized');

  const delegated = await delegateSuperAdminTenant(authority, requested);
  if (!delegated) throw new Error('Unauthorized');
  return delegated;
}
