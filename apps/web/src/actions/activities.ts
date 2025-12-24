'use server';

import { auth } from '@/lib/auth';
import { crmActivities, db, desc, eq, memberActivities } from '@interdomestik/database';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

const activitySchema = z.object({
  memberId: z.string().min(1),
  type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
});

export type LogActivityInput = z.infer<typeof activitySchema>;

export async function logActivity(data: LogActivityInput) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    return { error: 'Unauthorized' };
  }

  // Basic role check - only agents, staff, admins can log activities
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

    // Revalidate relevant paths
    revalidatePath(`/agent/crm/leads/${memberId}`);
    revalidatePath(`/admin/users/${memberId}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to log activity:', error);
    return { error: 'Failed to log activity. Please try again.' };
  }
}

export async function getMemberActivities(memberId: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (session.user.role === 'member' && session.user.id !== memberId) {
    throw new Error('Permission denied');
  }

  try {
    const activities = await db.query.memberActivities.findMany({
      where: eq(memberActivities.memberId, memberId),
      orderBy: [desc(memberActivities.occurredAt)],
      with: {
        // We'll fetch agent details to show who logged it
        agent: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    return activities;
  } catch (error) {
    console.error('Failed to fetch activities:', error);
    return [];
  }
}

export async function logLeadActivity(data: {
  leadId: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'other';
  subject: string;
  description?: string;
}) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) return { error: 'Unauthorized' };
  if (session.user.role === 'member') return { error: 'Permission denied' };

  try {
    const newActivity = {
      id: nanoid(),
      agentId: session.user.id,
      leadId: data.leadId,
      type: data.type === 'other' ? 'note' : data.type, // Map 'other' to 'note' if enum differs
      summary: data.subject, // Map subject to summary
      description: data.description,
      occurredAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(crmActivities).values(newActivity);

    revalidatePath(`/agent/crm/leads/${data.leadId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to log lead activity:', error);
    return { error: 'Failed to log activity.' };
  }
}

export async function getLeadActivities(leadId: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) throw new Error('Unauthorized');

  try {
    const activities = await db.query.crmActivities.findMany({
      where: eq(crmActivities.leadId, leadId),
      orderBy: [desc(crmActivities.occurredAt)],
      with: {
        agent: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    // Map to Activity interface used by ActivityFeed
    return activities.map(a => ({
      id: a.id,
      memberId: a.leadId, // overload memberId
      agentId: a.agentId,
      type: a.type as any,
      subject: a.summary,
      description: a.description,
      occurredAt: a.occurredAt,
      createdAt: a.createdAt,
      updatedAt: a.createdAt, // fallback
      agent: a.agent,
    }));
  } catch (error) {
    console.error('Failed to fetch lead activities:', error);
    return [];
  }
}
