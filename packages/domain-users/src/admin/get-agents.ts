import { and, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';

import type { UserSession } from '../types';
import { requireTenantAdminOrBranchManagerSession } from './access';

export async function getAgentsCore(params: { session: UserSession | null }) {
  const session = await requireTenantAdminOrBranchManagerSession(params.session);

  const scope = scopeFilter(session as unknown as SessionWithTenant);

  const tenantId = scope.tenantId;
  const conditions = [eq(user.role, 'agent')];

  if (!scope.isFullTenantScope && scope.branchId) {
    conditions.push(eq(user.branchId, scope.branchId));
  }

  const agents = await db.query.user.findMany({
    where: withTenant(tenantId, user.tenantId, conditions.length ? and(...conditions) : undefined),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return agents;
}
