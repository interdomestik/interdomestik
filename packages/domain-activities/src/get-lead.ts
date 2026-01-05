import { crmActivities, db, desc, eq } from '@interdomestik/database';
import { and } from 'drizzle-orm';

import { mapLeadActivitiesToFeedRows } from './map-lead';
import type { ActivitySession } from './types';

export async function getLeadActivitiesCore(params: {
  session: ActivitySession | null;
  leadId: string;
}) {
  const { session, leadId } = params;

  if (!session) throw new Error('Unauthorized');

  try {
    const activities = await db.query.crmActivities.findMany({
      where: and(
        eq(crmActivities.leadId, leadId),
        eq(crmActivities.tenantId, session.user.tenantId!)
      ),
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
