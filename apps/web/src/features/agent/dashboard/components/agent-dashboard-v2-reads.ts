import { getAgentMemberCount } from '@interdomestik/domain-agent';
import { getAgentDashboardV2StatsCore } from '@/app/[locale]/(agent)/agent/_core';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function readAgentDashboardV2Stats(args: {
  agentId: string;
  authority: TenantAuthority;
}) {
  const { agentId, authority } = args;
  const { tenantId } = readTenantAuthority(authority);
  const [stats, clientCount] = await Promise.all([
    withTenantAuthority(authority, tx =>
      getAgentDashboardV2StatsCore({ agentId, tenantId }, { db: tx })
    ),
    getAgentMemberCount({ agentId, authority }),
  ]);
  return { ...stats, clientCount };
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
