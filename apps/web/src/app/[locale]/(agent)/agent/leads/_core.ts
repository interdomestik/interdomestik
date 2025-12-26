import { db } from '@interdomestik/database/db';
import { crmLeads } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';

export type AgentLeadRow = typeof crmLeads.$inferSelect;

export async function getAgentLeadsCore(args: { agentId: string }): Promise<AgentLeadRow[]> {
  return db
    .select()
    .from(crmLeads)
    .where(eq(crmLeads.agentId, args.agentId))
    .orderBy(desc(crmLeads.updatedAt));
}
