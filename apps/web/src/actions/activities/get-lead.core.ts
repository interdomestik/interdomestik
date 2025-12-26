import { crmActivities, db, desc, eq } from '@interdomestik/database';

import { getSessionFromHeaders } from './context';
import { mapLeadActivitiesToFeedRows } from './map-lead';

export async function getLeadActivitiesCore(leadId: string) {
  const session = await getSessionFromHeaders();

  if (!session) throw new Error('Unauthorized');

  try {
    const activities = await db.query.crmActivities.findMany({
      where: eq(crmActivities.leadId, leadId),
      orderBy: [desc(crmActivities.occurredAt)],
      with: {
        agent: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    return mapLeadActivitiesToFeedRows(activities);
  } catch (error) {
    console.error('Failed to fetch lead activities:', error);
    return [];
  }
}
