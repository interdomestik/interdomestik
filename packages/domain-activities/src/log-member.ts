import { db, memberActivities, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
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
    return { success: false, error: 'Unauthorized' };
  }

  if (session.user.role === 'member') {
    return { success: false, error: 'Permission denied' };
  }
  if (!session.user.tenantId) {
    return { success: false, error: 'Missing tenantId' };
  }

  const result = activitySchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: 'Validation failed' };
  }

  const { memberId, type, subject, description } = result.data;

  try {
    const member = await db.query.user.findFirst({
      where: eq(user.id, memberId),
    });

    if (!member || member.tenantId !== session.user.tenantId) {
      return { success: false, error: 'Member access denied' };
    }

    if (session.user.role === 'agent' && member.agentId !== session.user.id) {
      return { success: false, error: 'Member access denied' };
    }

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

    return { success: true, error: undefined };
  } catch (error) {
    console.error('Failed to log activity:', error);
    return { success: false, error: 'Failed to log activity. Please try again.' };
  }
}
