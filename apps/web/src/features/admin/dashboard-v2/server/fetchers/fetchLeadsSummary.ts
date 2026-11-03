import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { memberLeads } from '@interdomestik/database/schema';
import { count, desc, eq, sql } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function fetchLeadsSummary(authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  const [leadsStats] = await withTenantAuthority(authority, tx =>
    tx
      .select({
        total: count(),
        converted: sql<number>`count(*) filter (where ${memberLeads.status} = 'converted')`,
      })
      .from(memberLeads)
      .where(eq(memberLeads.tenantId, tenantId))
  );

  const recentLeads = await withTenantAuthority(authority, tx =>
    tx
      .select()
      .from(memberLeads)
      .where(eq(memberLeads.tenantId, tenantId))
      .orderBy(desc(memberLeads.createdAt))
      .limit(5)
  );

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
