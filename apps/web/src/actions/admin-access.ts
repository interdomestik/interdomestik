'use server';

import { requireTenantAdminOrBranchManagerSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';

import { getActionContext } from './admin-users/context';

export async function canAccessAdmin(): Promise<boolean> {
  const { session } = await getActionContext();

  try {
    await requireTenantAdminOrBranchManagerSession(session as unknown as UserSession | null);
    return true;
  } catch {
    return false;
  }
}
