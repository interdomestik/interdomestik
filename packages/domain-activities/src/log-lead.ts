import { crmActivities, crmLeads } from '@interdomestik/database';
import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { activityActorOf, canAccessLead, isLeadActivityRole } from './access';
import { leadActivitySchema, type LogLeadActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
export type { LogLeadActivityInput } from './schema';

const LEAD_ACCESS_DENIED: ActionResult = { success: false, error: 'Lead access denied' };

export async function logLeadActivityCore(params: {
  session: ActivitySession | null;
  authority: TenantAuthority | null;
  data: LogLeadActivityInput;
}): Promise<ActionResult> {
  const { session, authority, data } = params;

  if (!session) return { success: false, error: 'Unauthorized' };

  // SECURITY: RBAC check
  if (!isLeadActivityRole(session.user.role)) {
    return { success: false, error: 'Permission denied: insufficient role' };
  }

  // SECURITY: Tenant scoping
  if (!session.user.tenantId) {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) {
    return { success: false, error: 'Unauthorized' };
  }
  // SECURITY: the actor is the authority's principal, never the session alone.
  const actor = activityActorOf(session, authority);
  if (!actor) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = leadActivitySchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.issues[0]?.message ?? 'invalid input'}`,
    };
  }
  const { leadId, type, subject, description } = parsed.data;

  try {
    // The lead is read FOR SHARE in the transaction that inserts the activity, so the assignment
    // the check saw holds until the insert commits (R-17).
    return await withTenantAuthority(authority, async tx => {
      const [lead] = await tx
        .select({ agentId: crmLeads.agentId })
        .from(crmLeads)
        .where(and(eq(crmLeads.id, leadId), eq(crmLeads.tenantId, actor.tenantId)))
        .for('share');

      if (!lead || !canAccessLead({ id: actor.userId, role: actor.role }, lead.agentId)) {
        return LEAD_ACCESS_DENIED;
      }

      const now = new Date();
      await tx.insert(crmActivities).values({
        id: nanoid(),
        tenantId: actor.tenantId,
        agentId: actor.userId,
        leadId,
        type: type === 'other' ? 'note' : type,
        summary: subject,
        description,
        occurredAt: now,
        createdAt: now,
      });

      return { success: true, error: undefined } satisfies ActionResult;
    });
  } catch (error) {
    console.error('Failed to log lead activity:', error);
    return { success: false, error: 'Failed to log activity.' };
  }
}
