import { crmActivities, db, desc, eq } from '@interdomestik/database';
import { and } from 'drizzle-orm';

import { mapLeadActivitiesToFeedRows } from './map-lead';
import type { ActivitySession } from './types';

const MAX_ACTIVITIES = 100; // Pagination cap

export async function getLeadActivitiesCore(params: {
  session: ActivitySession | null;
  leadId: string;
  limit?: number;
}) {
  const { session, leadId, limit } = params;

  if (!session) {
    throw new Error('Unauthorized');
  }

  // SECURITY: Tenant scoping
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    throw new Error('Missing tenantId');
  }

  // SECURITY: Cap results
  const effectiveLimit = Math.min(limit ?? MAX_ACTIVITIES, MAX_ACTIVITIES);

  try {
    const activities = await db.query.crmActivities.findMany({
      where: and(eq(crmActivities.leadId, leadId), eq(crmActivities.tenantId, tenantId)),
      orderBy: [desc(crmActivities.occurredAt)],
      limit: effectiveLimit,
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
