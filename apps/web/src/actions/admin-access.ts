'use server';

import { requireTenantAdminOrBranchManagerSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

export async function canAccessAdmin(): Promise<boolean> {
  try {
    const authorized = await authorizeSessionTenant();
    await requireTenantAdminOrBranchManagerSession(
      (authorized?.session ?? null) as unknown as UserSession | null,
      authorized?.authority
    );
    return true;
  } catch {
    return false;
  }
}
