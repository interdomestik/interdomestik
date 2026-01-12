// Phase 2.7: Ops Center Dashboard Shell (Client)
'use client';

import type { ClaimOperationalRow, OperationalKPIs } from '../../types';
import { QueueSidebar } from './QueueSidebar';
import { WorkCenter } from './WorkCenter';

interface OpsDashboardProps {
  kpis: OperationalKPIs;
  claims: ClaimOperationalRow[];
  hasMore: boolean;
  page: number;
}

/**
 * OpsDashboard — 3-pane layout shell for Ops Center.
 * Handles client-side state for preview drawer selection only.
 */
export function OpsDashboard({ kpis, claims, hasMore, page }: OpsDashboardProps) {
  return (
    <div className="flex h-[calc(100vh-140px)] overflow-hidden">
      {/* 1. Queue Sidebar (Fixed width) */}
      <QueueSidebar kpis={kpis} />

      {/* 2. Work Center (Fluid, scrollable) */}
      <WorkCenter claims={claims} hasMore={hasMore} currentPage={page} />
    </div>
  );
}
