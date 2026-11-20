import 'server-only';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ROLES } from '@interdomestik/shared-auth';
import { hasEffectivePortalAccess } from '@/server/auth/effective-portal-access';
import { ADMIN_USER_ROLES, canReadAdminAnalytics } from './admin-capabilities';

/** Preserve explicit admin grants without allowing a grant to widen a manager's branch. */
export async function hasAdminAnalyticsReadAccess(authority: TenantAuthority): Promise<boolean> {
  const { tenantId, principal } = readTenantAuthority(authority);
  if (!principal) return false;
  const { userId, role, branchId } = principal;
  if (canReadAdminAnalytics(role, branchId)) return true;
  // Members were already refused by the analytics page; managers always need a branch.
  if (role === ROLES.branch_manager || role === ROLES.member) return false;
  const hasAdminGrant = await hasEffectivePortalAccess(
    { user: { id: userId, tenantId, role } },
    ADMIN_USER_ROLES
  ).catch(() => false);
  return canReadAdminAnalytics(role, branchId, hasAdminGrant);
}
