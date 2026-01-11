import { db } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema';
import { count, desc, eq, sql } from 'drizzle-orm';

export async function fetchLeadsSummary(tenantId: string) {
  const [leadsStats] = await db
    .select({
      total: count(),
      converted: sql<number>`count(*) filter (where ${memberLeads.status} = 'converted')`,
    })
    .from(memberLeads)
    .where(eq(memberLeads.tenantId, tenantId));

  const recentLeads = await db
    .select()
    .from(memberLeads)
    .where(eq(memberLeads.tenantId, tenantId))
    .orderBy(desc(memberLeads.createdAt))
    .limit(5);

  const conversionRate =
    leadsStats && leadsStats.total > 0 ? (leadsStats.converted / leadsStats.total) * 100 : 0;

  return {
    total: leadsStats?.total ?? 0,
    converted: leadsStats?.converted ?? 0,
    conversionRate,
    recent: recentLeads.map(l => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      status: l.status,
      createdAt: l.createdAt,
    })),
  };
}
