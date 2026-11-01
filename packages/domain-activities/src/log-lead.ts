import { crmActivities, crmLeads, withTenantContext } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { leadActivitySchema, type LogLeadActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';
export type { LogLeadActivityInput } from './schema';

// NOSONAR
/** Roles allowed to log lead activities */
const ALLOWED_ROLES = new Set(['admin', 'staff', 'agent']);

export async function logLeadActivityCore(params: {
  session: ActivitySession | null;
  data: LogLeadActivityInput;
}): Promise<ActionResult> {
  const { session, data } = params;

  if (!session) return { success: false, error: 'Unauthorized' };

  // SECURITY: RBAC check
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return { success: false, error: 'Permission denied: insufficient role' };
  }

  // SECURITY: Tenant scoping
  if (!session.user.tenantId) {
    return { success: false, error: 'Missing tenantId' };
  }
  const tenantId = session.user.tenantId;

  const parsed = leadActivitySchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.issues[0]?.message ?? 'invalid input'}`,
    };
  }
  const { leadId, type, subject, description } = parsed.data;

  try {
    // db-access-guard: tenant-scoped -- reason: tenantId from validated session or authScope in current call path
    const lead = await withTenantContext({ tenantId }, tx =>
      tx.query.crmLeads.findFirst({
        where: eq(crmLeads.id, leadId),
      })
    );

    if (!lead || lead.tenantId !== tenantId) {
      return { success: false, error: 'Lead access denied' };
    }

    if (session.user.role === 'agent' && lead.agentId !== session.user.id) {
      return { success: false, error: 'Lead access denied' };
    }

    const newActivity = {
      id: nanoid(),
      tenantId,
      agentId: session.user.id,
      leadId,
      type: type === 'other' ? 'note' : type,
      summary: subject,
      description,
      occurredAt: new Date(),
      createdAt: new Date(),
    };

    // db-access-guard: tenant-scoped -- reason: tenantId from validated session or authScope in current call path
    await withTenantContext({ tenantId }, tx => tx.insert(crmActivities).values(newActivity));

    return { success: true, error: undefined };
  } catch (error) {
    console.error('Failed to log lead activity:', error);
    return { success: false, error: 'Failed to log activity.' };
  }
}
