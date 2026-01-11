'use client';

import type { BranchDashboardV2Data } from '../server/getBranchDashboardV2Data';
import { AgentHealthPanel } from './AgentHealthPanel';
import { BranchDashboardHeader } from './BranchDashboardHeader';
import { BranchKpiRow } from './BranchKpiRow';
import { ClaimsPipelinePanel } from './ClaimsPipelinePanel';
import { OperationalAlertsPanel } from './OperationalAlertsPanel';
import { StaffLoadPanel } from './StaffLoadPanel';

interface BranchDashboardV2Props {
  data: BranchDashboardV2Data;
}

export function BranchDashboardV2({ data }: BranchDashboardV2Props) {
  return (
    <div className="space-y-6">
      <BranchDashboardHeader branch={data.branch} health={data.health} />

      <BranchKpiRow kpis={data.kpis} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Priority Panels */}
        <OperationalAlertsPanel
          alerts={{
            cashPending: data.kpis.cashPending,
            slaBreaches: data.kpis.slaBreaches,
          }}
        />

        <ClaimsPipelinePanel pipeline={data.pipeline} />

        <StaffLoadPanel staff={data.staffLoad} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <AgentHealthPanel agents={data.agentHealth} />
      </div>
    </div>
  );
}
