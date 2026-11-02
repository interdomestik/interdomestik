import { delegateSuperAdminTenant } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { revalidatePath } from 'next/cache';

export function revalidateAdminUserPage(locale: string | undefined, userId: string) {
  if (locale) {
    revalidatePath(`/${locale}/admin/users/${userId}`);
    revalidatePath(`/${locale}/admin/users`);
  }
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
}

export function resolveTenantForAdminAction(
  session: { user?: { accessTenantId?: string | null; tenantId?: string | null } | null },
  tenantId?: string,
  role?: string
): string | undefined {
  const sessionTenantId = session.user?.accessTenantId?.trim() || session.user?.tenantId?.trim();
  if (role === 'super_admin') {
    return tenantId ?? sessionTenantId;
  }
  return sessionTenantId ?? tenantId;
}

/**
 * The authority an admin action runs under. The client-supplied tenant id never chooses the tenant:
 * a non-super_admin always uses the session authority; a super_admin naming another tenant gets a
 * delegation minted by the platform directory, and an unknown or inactive tenant fails closed.
 */
export async function resolveAdminActionAuthority(
  session: { user?: { role?: string | null } | null },
  authority: TenantAuthority,
  clientTenantId?: string | null
): Promise<TenantAuthority> {
  const requested = clientTenantId?.trim();
  if (session.user?.role !== 'super_admin' || !requested) return authority;
  if (requested === readTenantAuthority(authority).tenantId) return authority;
  const delegated = await delegateSuperAdminTenant(authority, requested);
  if (!delegated) throw new Error('Unauthorized');
  return delegated;
}
