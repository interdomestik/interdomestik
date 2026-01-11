import * as Sentry from '@sentry/nextjs';
import { fetchAgentPerformance } from './fetchers/fetchAgentPerformance';
import { fetchBranchesSnapshot } from './fetchers/fetchBranchesSnapshot';
import { fetchClaimsPipeline } from './fetchers/fetchClaimsPipeline';
import { fetchKpis } from './fetchers/fetchKpis';
import { fetchLeadsSummary } from './fetchers/fetchLeadsSummary';

export type DashboardV2Data = {
  kpis: Awaited<ReturnType<typeof fetchKpis>>;
  branchesSnapshot: Awaited<ReturnType<typeof fetchBranchesSnapshot>>;
  alerts: {
    id: string;
    type: 'critical' | 'warning' | 'info';
    message: string;
    timestamp: Date;
    actionUrl?: string;
  }[];
  claimsPipeline: Awaited<ReturnType<typeof fetchClaimsPipeline>>;
  leadsSummary: Awaited<ReturnType<typeof fetchLeadsSummary>>;
  agentPerformance: Awaited<ReturnType<typeof fetchAgentPerformance>>;
};

export async function getTenantAdminDashboardV2Data(tenantId: string): Promise<DashboardV2Data> {
  return Sentry.withServerActionInstrumentation(
    'getTenantAdminDashboardV2Data',
    { recordResponse: true },
    async () => {
      try {
        const [kpis, branchesSnapshot, claimsPipeline, leadsSummary, agentPerformance] =
          await Promise.all([
            fetchKpis(tenantId),
            fetchBranchesSnapshot(tenantId),
            fetchClaimsPipeline(tenantId),
            fetchLeadsSummary(tenantId),
            fetchAgentPerformance(tenantId),
          ]);

        return {
          kpis,
          branchesSnapshot,
          alerts: [], // TODO: wired up to a future alerts system
          claimsPipeline,
          leadsSummary,
          agentPerformance,
        };
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            feature: 'admin-dashboard-v2',
            tenantId,
          },
        });
        throw error;
      }
    }
  );
}
