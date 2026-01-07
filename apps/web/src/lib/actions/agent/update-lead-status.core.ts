import { db } from '@interdomestik/database/db';
import { crmLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { isLeadStage } from './schemas';

export async function updateLeadStatusCore(agentId: string, leadId: string, stage: string) {
  const lead = await db.query.crmLeads.findFirst({
    where: eq(crmLeads.id, leadId),
  });

  if (lead?.agentId !== agentId) {
    return { error: 'Not found' as const };
  }

  if (!isLeadStage(stage)) {
    return { error: 'Invalid stage' as const };
  }

  await db.update(crmLeads).set({ stage, updatedAt: new Date() }).where(eq(crmLeads.id, leadId));
  return { success: true as const };
}
