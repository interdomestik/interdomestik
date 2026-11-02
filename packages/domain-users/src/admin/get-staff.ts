import { inArray, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getStaffCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
}) {
  await requireTenantAdminSession(params.session);
  if (!params.authority) throw new Error('Unauthorized');
  const authority = params.authority;

  const { tenantId } = readTenantAuthority(authority);

  const staff = await withTenantAuthority(authority, tx =>
    tx.query.user.findMany({
      where: withTenant(tenantId, user.tenantId, inArray(user.role, [ROLES.staff, ROLES.admin])),
      orderBy: (users, { asc }) => [asc(users.name)],
    })
  );

  return staff;
}
