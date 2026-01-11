import { db } from '@interdomestik/database';
import { memberLeads, user } from '@interdomestik/database/schema';
import { and, count, desc, eq } from 'drizzle-orm';

export async function fetchAgentPerformance(tenantId: string) {
  // Find top agents by converted leads
  const topAgents = await db
    .select({
      agentId: memberLeads.agentId,
      sales: count(),
    })
    .from(memberLeads)
    .where(and(eq(memberLeads.tenantId, tenantId), eq(memberLeads.status, 'converted')))
    .groupBy(memberLeads.agentId)
    .orderBy(desc(count()))
    .limit(5);

  const data = await Promise.all(
    topAgents.map(async stat => {
      const [agentUser] = await db.select().from(user).where(eq(user.id, stat.agentId));

      // Get actively working leads for this agent
      const [activeLeads] = await db
        .select({ count: count() })
        .from(memberLeads)
        .where(and(eq(memberLeads.agentId, stat.agentId), eq(memberLeads.status, 'new')));

      return {
        id: stat.agentId,
        name: agentUser?.name || 'Unknown Agent',
        sales: stat.sales,
        activeLeads: activeLeads?.count ?? 0,
      };
    })
  );

  return data;
}
