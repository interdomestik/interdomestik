import { db, memberActivities } from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { activitySchema, type LogActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';

export type { LogActivityInput } from './schema';

export async function logActivityCore(params: {
  session: ActivitySession | null;
  data: LogActivityInput;
}): Promise<ActionResult> {
  const { session, data } = params;

  if (!session) {
    return { error: 'Unauthorized' };
  }

  if (session.user.role === 'member') {
    return { error: 'Permission denied' };
  }
  if (!session.user.tenantId) {
    return { error: 'Missing tenantId' };
  }

  const result = activitySchema.safeParse(data);
  if (!result.success) {
    return { error: 'Validation failed' };
  }

  const { memberId, type, subject, description } = result.data;

  try {
    const newActivity = {
      id: nanoid(),
      tenantId: session.user.tenantId,
      agentId: session.user.id,
      memberId,
      type,
      subject,
      description,
      occurredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(memberActivities).values(newActivity);

    return { success: true };
  } catch (error) {
    console.error('Failed to log activity:', error);
    return { error: 'Failed to log activity. Please try again.' };
  }
}
