import { db, inArray, user } from '@interdomestik/database';

import { requireAdminSession } from './access';
import type { Session } from './context';

export async function getStaffCore(params: { session: NonNullable<Session> | null }) {
  requireAdminSession(params.session);

  const staff = await db.query.user.findMany({
    where: inArray(user.role, ['staff', 'admin']),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return staff;
}
