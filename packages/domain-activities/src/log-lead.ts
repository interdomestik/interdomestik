import { crmActivities, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { leadActivitySchema, type LogLeadActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';

export type { LogLeadActivityInput };
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

  const parsed = leadActivitySchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.issues[0]?.message ?? 'invalid input'}`,
    };
  }
  const { leadId, type, subject, description } = parsed.data;

  try {
    const newActivity = {
      id: nanoid(),
      tenantId: session.user.tenantId,
      agentId: session.user.id,
      leadId,
      type: type === 'other' ? 'note' : type,
      summary: subject,
      description,
      occurredAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(crmActivities).values(newActivity);

    return { success: true, error: undefined };
  } catch (error) {
    console.error('Failed to log lead activity:', error);
    return { success: false, error: 'Failed to log activity.' };
  }
}
