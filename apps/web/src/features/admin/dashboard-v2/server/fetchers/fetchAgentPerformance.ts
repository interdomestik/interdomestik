import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { memberLeads, user } from '@interdomestik/database/schema';
import { and, count, desc, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function fetchAgentPerformance(authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  // Find top agents by converted leads
  const topAgents = await withTenantAuthority(authority, tx =>
    tx
      .select({
        agentId: memberLeads.agentId,
        sales: count(),
      })
      .from(memberLeads)
      .where(and(eq(memberLeads.tenantId, tenantId), eq(memberLeads.status, 'converted')))
      .groupBy(memberLeads.agentId)
      .orderBy(desc(count()))
      .limit(5)
  );

  const data = await Promise.all(
    topAgents.map(async stat => {
      // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
      const [agentUser] = await withTenantAuthority(authority, tx =>
        tx.select().from(user).where(eq(user.id, stat.agentId))
      );

      // Get actively working leads for this agent
      // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
      const [activeLeads] = await withTenantAuthority(authority, tx =>
        tx
          .select({ count: count() })
          .from(memberLeads)
          .where(and(eq(memberLeads.agentId, stat.agentId), eq(memberLeads.status, 'new')))
      );

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
