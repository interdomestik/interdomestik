// Phase 2.7: Queue Sidebar Component
import { AlertTriangle, Clock, Inbox, User, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OperationalKPIs } from '../../types';
import { QueueItem } from './QueueItem';

interface QueueSidebarProps {
  kpis: OperationalKPIs;
}

/**
 * QueueSidebar — Left pane with filter navigation.
 * Priority filters + Assigned to Me.
 */
export function QueueSidebar({ kpis }: QueueSidebarProps) {
  const t = useTranslations('admin.claims_page.ops_center');

  return (
    <aside
      className="w-60 flex-shrink-0 border-r border-white/5 py-4 pr-4 space-y-4"
      data-testid="queue-sidebar"
    >
      {/* Priority Filters */}
      <div className="space-y-1">
        <QueueItem
          label={t('queue.all')}
          count={kpis.totalOpen}
          icon={Inbox}
          filterKey="priority"
          filterValue=""
          testId="queue-all"
        />
        <QueueItem
          label={t('queue.needs_action')}
          count={kpis.needsAction}
          icon={Zap}
          filterKey="priority"
          filterValue="needs_action"
          testId="queue-needs-action"
        />
        <QueueItem
          label={t('queue.sla_breach')}
          count={kpis.slaBreach}
          icon={Clock}
          filterKey="priority"
          filterValue="sla"
          testId="queue-sla-breach"
        />
        <QueueItem
          label={t('queue.unassigned')}
          count={kpis.unassigned}
          icon={Users}
          filterKey="priority"
          filterValue="unassigned"
          testId="queue-unassigned"
        />
        <QueueItem
          label={t('queue.stuck')}
          count={kpis.stuck}
          icon={AlertTriangle}
          filterKey="priority"
          filterValue="stuck"
          testId="queue-stuck"
        />
        <QueueItem
          label={t('queue.waiting_member')}
          count={kpis.waitingOnMember}
          icon={User}
          filterKey="priority"
          filterValue="waiting_member"
          testId="queue-waiting-member"
        />
      </div>

      {/* Separator */}
      <div className="border-t border-white/5" />

      {/* Assigned to Me */}
      <QueueItem
        label={t('queue.mine')}
        count={kpis.assignedToMe}
        icon={User}
        filterKey="priority"
        filterValue="mine"
        testId="queue-mine"
      />
    </aside>
  );
}
