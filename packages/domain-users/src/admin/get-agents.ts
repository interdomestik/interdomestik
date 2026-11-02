import { and, eq, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';

import type { UserSession } from '../types';
import { requireTenantAdminOrBranchManagerSession } from './access';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getAgentsCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
}) {
  const session = await requireTenantAdminOrBranchManagerSession(params.session);
  if (!params.authority) throw new Error('Unauthorized');
  const authority = params.authority;

  const scope = scopeFilter(session as unknown as SessionWithTenant);

  const { tenantId } = readTenantAuthority(authority);
  const conditions = [eq(user.role, 'agent')];

  if (!scope.isFullTenantScope && scope.branchId) {
    conditions.push(eq(user.branchId, scope.branchId));
  }

  const agents = await withTenantAuthority(authority, tx =>
    tx.query.user.findMany({
      where: withTenant(
        tenantId,
        user.tenantId,
        conditions.length ? and(...conditions) : undefined
      ),
      orderBy: (users, { asc }) => [asc(users.name)],
    })
  );

  return agents;
}
