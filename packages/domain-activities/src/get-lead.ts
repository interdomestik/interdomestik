import { crmActivities, crmLeads, desc, eq } from '@interdomestik/database';
import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { and } from 'drizzle-orm';

import { activityActorOf, canAccessLead, isLeadActivityRole } from './access';
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

  // SECURITY: the actor is the authority's principal; deny by default before any read (R-16).
  const actor = activityActorOf(session, authority);
  if (!actor) {
    throw new Error('Unauthorized');
  }
  if (!isLeadActivityRole(actor.role)) {
    throw new Error('Permission denied');
  }

  // SECURITY: Cap results
  const effectiveLimit = Math.min(limit ?? MAX_ACTIVITIES, MAX_ACTIVITIES);

  // The lead is read FOR SHARE in the transaction that reads its activities, so the assignment
  // the check saw cannot change before the read completes (R-17).
  const activities = await withTenantAuthority(authority, async tx => {
    const [lead] = await tx
      .select({ agentId: crmLeads.agentId })
      .from(crmLeads)
      .where(and(eq(crmLeads.id, leadId), eq(crmLeads.tenantId, actor.tenantId)))
      .for('share');
    // An unknown lead and another agent's lead are refused alike (no existence oracle).
    if (!lead || !canAccessLead({ id: actor.userId, role: actor.role }, lead.agentId)) {
      throw new Error('Permission denied');
    }

    return tx.query.crmActivities.findMany({
      where: and(eq(crmActivities.leadId, leadId), eq(crmActivities.tenantId, actor.tenantId)),
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
    });
  });

  return mapLeadActivitiesToFeedRows(activities);
}
