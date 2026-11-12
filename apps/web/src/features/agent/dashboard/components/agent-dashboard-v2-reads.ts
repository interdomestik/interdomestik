import { getAgentMemberCount } from '@interdomestik/domain-agent';
import { getAgentDashboardV2StatsCore } from '@/app/[locale]/(agent)/agent/_core';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/**
 * The members-list count is reserved for a principal whose session role is agent. Users admitted
 * through an explicit agent grant keep the dashboard's own client count instead of failing the page.
 */
function readsMembersListCount(authority: TenantAuthority, agentId: string): boolean {
  const { principal } = readTenantAuthority(authority);
  return principal?.userId === agentId && principal.role === 'agent';
}

export async function readAgentDashboardV2Stats(args: {
  agentId: string;
  authority: TenantAuthority;
}) {
  const { agentId, authority } = args;
  const { tenantId } = readTenantAuthority(authority);
  const membersListCount = readsMembersListCount(authority, agentId)
    ? getAgentMemberCount({ agentId, authority })
    : null;
  const [stats, clientCount] = await Promise.all([
    withTenantAuthority(authority, tx =>
      getAgentDashboardV2StatsCore({ agentId, tenantId }, { db: tx })
    ),
    membersListCount,
  ]);
  return { ...stats, clientCount: clientCount ?? stats.clientCount };
}

export function readAgentDashboardBranch(args: { branchId: string; authority: TenantAuthority }) {
  const { branchId, authority } = args;
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.branches.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.id, branchId), eq(fields.tenantId, tenantId)),
      columns: { name: true },
    })
  );
}
