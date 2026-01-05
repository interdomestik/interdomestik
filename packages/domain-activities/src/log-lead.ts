import { crmActivities, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { leadActivitySchema, type LogLeadActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';

export type { LogLeadActivityInput } from './schema';

export async function logLeadActivityCore(params: {
  session: ActivitySession | null;
  data: LogLeadActivityInput;
}): Promise<ActionResult> {
  const { session, data } = params;

  if (!session) return { error: 'Unauthorized' };
  if (session.user.role === 'member') return { error: 'Permission denied' };
  if (!session.user.tenantId) return { error: 'Missing tenantId' };

  if (!session.user.tenantId) return { error: 'Missing tenantId' };

  const parsed = leadActivitySchema.safeParse(data);
  if (!parsed.success) {
    return { error: 'Validation failed' };
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

    return { success: true };
  } catch (error) {
    console.error('Failed to log lead activity:', error);
    return { error: 'Failed to log activity.' };
  }
}
