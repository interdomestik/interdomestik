import { crmActivities, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';

import { getSessionFromHeaders } from './context';

export type LogLeadActivityInput = {
  leadId: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'other';
  subject: string;
  description?: string;
};

export async function logLeadActivityCore(data: LogLeadActivityInput) {
  const session = await getSessionFromHeaders();

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

    revalidatePath(`/agent/crm/leads/${data.leadId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to log lead activity:', error);
    return { error: 'Failed to log activity.' };
  }
}
