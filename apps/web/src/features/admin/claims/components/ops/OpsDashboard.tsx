// Phase 2.8: Ops Center Dashboard Shell (Client)
'use client';

import type { ClaimOperationalRow, OperationalKPIs } from '../../types';
import { QueueSidebar } from './QueueSidebar';
import { WorkCenter } from './WorkCenter';

interface OpsDashboardProps {
  kpis: OperationalKPIs;
  claims: ClaimOperationalRow[];
  hasMore: boolean;
  page: number;
  assignees: import('../../types').AssigneeSummary[];
  unassignedSummary: { countOpen: number; countNeedsAction: number };
  meSummary: { countOpen: number; countNeedsAction: number };
}

/**
 * OpsDashboard — 3-pane Client Component Shell.
 * - Left: Queue Sidebar (Filters)
 * - Middle: Work Center (List)
 * - Right: Claim Detail (managed via URL/layout, not here directly usually, but shell lays it out)
 */
export function OpsDashboard({
  kpis,
  claims,
  hasMore,
  page,
  assignees,
  unassignedSummary,
  meSummary,
}: OpsDashboardProps) {
  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[600px]">
      {/* 1. Left Sidebar: Queues */}
      <QueueSidebar
        kpis={kpis}
        assignees={assignees}
        unassignedSummary={unassignedSummary}
        meSummary={meSummary}
      />

      {/* 2. Middle Pane: Work Center (List) */}
      <WorkCenter claims={claims} hasMore={hasMore} currentPage={page} />
    </div>
  );
}
