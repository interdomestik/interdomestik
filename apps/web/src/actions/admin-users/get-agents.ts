import { db, eq, user } from '@interdomestik/database';

import { requireAdminSession } from './access';
import type { Session } from './context';

export async function getAgentsCore(params: { session: NonNullable<Session> | null }) {
  requireAdminSession(params.session);

  const agents = await db.query.user.findMany({
    where: eq(user.role, 'agent'),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return agents;
}
