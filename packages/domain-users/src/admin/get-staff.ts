import { db, inArray, user } from '@interdomestik/database';

import { requireAdminSession } from './access';
import type { UserSession } from '../types';

export async function getStaffCore(params: { session: UserSession | null }) {
  requireAdminSession(params.session);

  const staff = await db.query.user.findMany({
    where: inArray(user.role, ['staff', 'admin']),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return staff;
}
