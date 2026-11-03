import { crmActivities, desc, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and } from 'drizzle-orm';

import { mapLeadActivitiesToFeedRows } from './map-lead';
import type { ActivitySession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const MAX_ACTIVITIES = 100; // Pagination cap

export async function getLeadActivitiesCore(params: {
  session: ActivitySession | null;
  authority: TenantAuthority | null;
  leadId: string;
  limit?: number;
}) {
  const { session, authority, leadId, limit } = params;

  if (!session) {
    throw new Error('Unauthorized');
  }

  // SECURITY: Tenant scoping
  if (!authority) {
    throw new Error('Unauthorized');
  }
  const { tenantId } = readTenantAuthority(authority);
  if (!tenantId) {
    throw new Error('Missing tenantId');
  }

  // SECURITY: Cap results
  const effectiveLimit = Math.min(limit ?? MAX_ACTIVITIES, MAX_ACTIVITIES);

  try {
    const activities = await withTenantAuthority(authority, tx =>
      tx.query.crmActivities.findMany({
        where: and(eq(crmActivities.leadId, leadId), eq(crmActivities.tenantId, tenantId)),
        columns: {
          agentId: true,
          completedAt: true,
          createdAt: true,
          id: true,
          leadId: true,
          scheduledAt: true,
          summary: true,
          tenantId: true,
          type: true,
        },
        orderBy: [desc(crmActivities.createdAt)],
        limit: effectiveLimit,
        with: {
          agent: {
            columns: { id: true, name: true, email: true },
          },
        },
      })
    );

    return mapLeadActivitiesToFeedRows(activities);
  } catch (error) {
    console.error('Failed to fetch lead activities:', error);
    return [];
  }
}
