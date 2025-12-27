import { crmActivities, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';

import type { ActionResult, ActivitySession, LogLeadActivityInput } from './types';

export type { LogLeadActivityInput } from './types';

export async function logLeadActivityCore(params: {
  session: ActivitySession | null;
  data: LogLeadActivityInput;
}): Promise<ActionResult> {
  const { session, data } = params;

  if (!session) return { error: 'Unauthorized' };
  if (session.user.role === 'member') return { error: 'Permission denied' };

  try {
    const newActivity = {
      id: nanoid(),
      agentId: session.user.id,
      leadId: data.leadId,
      type: data.type === 'other' ? 'note' : data.type,
      summary: data.subject,
      description: data.description,
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
