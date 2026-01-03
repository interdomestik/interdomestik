import { db, inArray, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';

export async function getStaffCore(params: { session: UserSession | null }) {
  const session = await requireTenantAdminSession(params.session);

  const scope = scopeFilter(session as unknown as SessionWithTenant);
  const tenantId = scope.tenantId;

  const staff = await db.query.user.findMany({
    where: withTenant(tenantId, user.tenantId, inArray(user.role, ['staff', 'admin'])),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return staff;
}
