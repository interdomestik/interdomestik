import { db, memberActivities, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { activitySchema, type LogActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';

export type { LogActivityInput } from './schema';

async function hasMemberActivitiesTable(): Promise<boolean> {
  // Keep this check local to avoid importing extra helpers and to prevent noisy prod errors
  // if the optional member_activities table hasn't been migrated yet.
  try {
    const rows = await db.execute(`SELECT to_regclass('public.member_activities') AS regclass`);
    const first = rows[0] as unknown as { regclass?: string | null; to_regclass?: string | null };
    return Boolean(first?.regclass ?? first?.to_regclass);
  } catch {
    return false;
  }
}

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
    if (!(await hasMemberActivitiesTable())) {
      return { success: false, error: 'Activity log unavailable' };
    }

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
    // Avoid polluting production error logs when optional activity capture isn't available.
    console.warn('Failed to log activity:', error);
    return { success: false, error: 'Failed to log activity. Please try again.' };
  }
}
