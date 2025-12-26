import { db, desc, eq, memberActivities } from '@interdomestik/database';

import { getSessionFromHeaders } from './context';

export async function getMemberActivitiesCore(memberId: string) {
  const session = await getSessionFromHeaders();

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (session.user.role === 'member' && session.user.id !== memberId) {
    throw new Error('Permission denied');
  }

  try {
    const activities = await db.query.memberActivities.findMany({
      where: eq(memberActivities.memberId, memberId),
      orderBy: [desc(memberActivities.occurredAt)],
      with: {
        agent: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    return activities;
  } catch (error) {
    console.error('Failed to fetch activities:', error);
    return [];
  }
}
