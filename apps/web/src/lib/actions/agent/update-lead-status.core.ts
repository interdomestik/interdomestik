import { db } from '@interdomestik/database/db';
import { crmLeads } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { isLeadStage } from './schemas';

export async function updateLeadStatusCore(
  agentId: string,
  tenantId: string,
  leadId: string,
  stage: string
) {
  const leadWhere = and(
    eq(crmLeads.id, leadId),
    eq(crmLeads.tenantId, tenantId),
    eq(crmLeads.agentId, agentId)
  );

  const lead = await db.query.crmLeads.findFirst({
    where: leadWhere,
  });

  if (!lead) {
    return { error: 'Not found' as const };
  }

  if (!isLeadStage(stage)) {
    return { error: 'Invalid stage' as const };
  }

  await db.update(crmLeads).set({ stage, updatedAt: new Date() }).where(leadWhere);
  return { success: true as const };
}
