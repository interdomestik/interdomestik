import 'server-only';

import { hasEffectivePortalAccess } from '@/server/auth/effective-portal-access';
import {
  ADMIN_USER_ROLES,
  canReadAdminAnalytics,
  type AdminNavigationCapabilities,
} from './admin-capabilities';

type NavigationSession =
  | (NonNullable<Parameters<typeof hasEffectivePortalAccess>[0]> & {
      user?: { branchId?: string | null } | null;
    })
  | null;

/** Use the people route's tenant-grant resolver before serializing navigation capabilities. */
export async function resolveAdminNavigationCapabilities(
  session: NavigationSession
): Promise<AdminNavigationCapabilities> {
  const canAccessUsers = await hasEffectivePortalAccess(session, ADMIN_USER_ROLES).catch(
    () => false
  );
  return {
    canAccessUsers,
    canReadAnalytics: canReadAdminAnalytics(
      session?.user?.role,
      session?.user?.branchId,
      canAccessUsers
    ),
  };
}
