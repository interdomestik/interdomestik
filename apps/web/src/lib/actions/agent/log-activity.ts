import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function logActivityCore(
  agentId: string,
  leadId: string,
  type: string,
  summary: string
) {
  const lead = await db.query.crmLeads.findFirst({
    where: eq(crmLeads.id, leadId),
  });

  if (!lead || lead.agentId !== agentId) {
    return { error: 'Not found' as const };
  }

  await db.insert(crmActivities).values({
    id: nanoid(),
    leadId,
    agentId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    summary,
    createdAt: new Date(),
  });

  return { success: true as const };
}
