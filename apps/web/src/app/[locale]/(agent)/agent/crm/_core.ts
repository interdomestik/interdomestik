import { getAgentCrmDashboard, type AgentCrmDashboard } from '@interdomestik/domain-crm/dashboards';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { crmDashboardRepository } from '@/lib/domain-crm/dashboard-repository';

export type AgentCrmStats = AgentCrmDashboard;
export type { AgentCrmDashboardDueFollowUp as AgentCrmDueFollowUp } from '@interdomestik/domain-crm/dashboards';

export class AgentCrmStatsAccessDeniedError extends Error {
  constructor(readonly reason: string) {
    super(`CRM dashboard read denied: ${reason}`);
    this.name = 'AgentCrmStatsAccessDeniedError';
  }
}

export async function getAgentCrmStatsCore(args: {
  actor: CrmActorContext;
}): Promise<AgentCrmStats> {
  const result = await getAgentCrmDashboard({ actor: args.actor }, crmDashboardRepository, {
    now: () => new Date().toISOString(),
  });

  if (!result.success) {
    throw new AgentCrmStatsAccessDeniedError(result.reason);
  }

  return result.dashboard;
}
