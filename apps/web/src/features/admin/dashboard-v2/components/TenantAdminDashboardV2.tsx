'use client';

import type { DashboardV2Data } from '../server/getTenantAdminDashboardV2Data';
import { BranchSnapshotPanel } from './BranchSnapshotPanel';
import { DashboardHeader } from './DashboardHeader';
import { KpiGridPrimary } from './KpiGridPrimary';
import { OpsAlertsPanel } from './OpsAlertsPanel';
import { SecondaryPanelsGrid } from './SecondaryPanelsGrid';

export function TenantAdminDashboardV2({
  data,
  tenantName,
}: {
  data: DashboardV2Data;
  tenantName: string;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <DashboardHeader tenantName={tenantName} today={new Date()} />

      <KpiGridPrimary kpis={data.kpis} />

      <div className="grid grid-cols-12 gap-6 h-auto md:h-[350px]">
        {/* Branch Snapshot - Spans 8 cols on large screens */}
        <BranchSnapshotPanel branches={data.branchesSnapshot} colSpan={8} />

        {/* Ops Alerts - Spans 4 cols on large screens */}
        <OpsAlertsPanel alerts={data.alerts} colSpan={4} />
      </div>

      <SecondaryPanelsGrid
        claims={data.claimsPipeline}
        leads={data.leadsSummary}
        agents={data.agentPerformance}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground mt-8 pt-4 border-t border-white/10">
        <span>Data Freshness: Real-time</span>
        <span className="font-mono opacity-50">v2.0.0-ops</span>
      </div>
    </div>
  );
}
