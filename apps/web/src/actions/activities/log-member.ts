import { db, memberActivities } from '@interdomestik/database';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';

import { getSessionFromHeaders } from './context';
import { activitySchema, type LogActivityInput } from './schema';

export async function logActivityCore(data: LogActivityInput) {
  const session = await getSessionFromHeaders();

  if (!session) {
    return { error: 'Unauthorized' };
  }

  if (['member'].includes(session.user.role)) {
    return { error: 'Permission denied' };
  }

  const result = activitySchema.safeParse(data);
  if (!result.success) {
    return { error: 'Validation failed' };
  }

  const { memberId, type, subject, description } = result.data;

  try {
    const newActivity = {
      id: nanoid(),
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

    revalidatePath(`/agent/crm/leads/${memberId}`);
    revalidatePath(`/admin/users/${memberId}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to log activity:', error);
    return { error: 'Failed to log activity. Please try again.' };
  }
}
