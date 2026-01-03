import { db, eq, user } from '@interdomestik/database';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';

export async function getAgentsCore(params: { session: UserSession | null }) {
  await requireTenantAdminSession(params.session);

  const agents = await db.query.user.findMany({
    where: eq(user.role, 'agent'),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return agents;
}
