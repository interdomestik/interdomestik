import { db, inArray, user } from '@interdomestik/database';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';

export async function getStaffCore(params: { session: UserSession | null }) {
  await requireTenantAdminSession(params.session);

  const staff = await db.query.user.findMany({
    where: inArray(user.role, ['staff', 'admin']),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return staff;
}
