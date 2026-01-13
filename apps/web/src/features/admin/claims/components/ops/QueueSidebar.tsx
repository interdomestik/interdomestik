// Phase 2.8: Queue Sidebar Component
import { AlertTriangle, Clock, Inbox, User, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AssigneeSummary, OperationalKPIs } from '../../types';
import { QueueItem } from './QueueItem';

interface QueueSidebarProps {
  kpis: OperationalKPIs;
  assignees: AssigneeSummary[];
  unassignedSummary?: { countOpen: number; countNeedsAction: number };
  meSummary?: { countOpen: number; countNeedsAction: number };
}

/**
 * QueueSidebar — Left pane with filter navigation.
 * Priority filters + Assigned to Me.
 */
export function QueueSidebar(props: QueueSidebarProps) {
  const t = useTranslations('admin.claims_page.ops_center');

  return (
    <aside
      className="hidden md:block w-60 flex-shrink-0 border-r border-white/5 py-4 pr-4 space-y-4"
      data-testid="queue-sidebar"
    >
      {/* Priority Filters */}
      <div className="space-y-1">
        <QueueItem
          label={t('queue.all')}
          count={props.kpis.totalOpen}
          icon={Inbox}
          filterKey="priority"
          filterValue=""
          testId="queue-all"
          clearParams={['assignee']}
        />
        <QueueItem
          label={t('queue.needs_action')}
          count={props.kpis.needsAction}
          icon={Zap}
          filterKey="priority"
          filterValue="needs_action"
          testId="queue-needs-action"
          clearParams={['assignee']}
        />
        <QueueItem
          label={t('queue.sla_breach')}
          count={props.kpis.slaBreach}
          icon={Clock}
          filterKey="priority"
          filterValue="sla"
          testId="queue-sla-breach"
          clearParams={['assignee']}
        />
        <QueueItem
          label={t('queue.unassigned')}
          count={props.kpis.unassigned}
          icon={Users}
          filterKey="priority"
          filterValue="unassigned"
          testId="queue-unassigned"
          clearParams={['assignee']}
        />
        <QueueItem
          label={t('queue.stuck')}
          count={props.kpis.stuck}
          icon={AlertTriangle}
          filterKey="priority"
          filterValue="stuck"
          testId="queue-stuck"
          clearParams={['assignee']}
        />
        <QueueItem
          label={t('queue.waiting_member')}
          count={props.kpis.waitingOnMember}
          icon={User}
          filterKey="priority"
          filterValue="waiting_member"
          testId="queue-waiting-member"
          clearParams={['assignee']}
        />
      </div>

      {/* Separator */}
      <div className="border-t border-white/5" />

      <h3 className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">
        {t('queue.workload')}
      </h3>

      <div className="space-y-1">
        {/* Assigned to Me */}
        <QueueItem
          label={t('queue.mine')}
          count={props.meSummary?.countOpen ?? props.kpis.assignedToMe}
          icon={User}
          filterKey="assignee"
          filterValue="me"
          testId="queue-mine"
          variant="default"
          clearParams={['priority']}
        />

        {/* Unassigned Workload */}
        <QueueItem
          label={t('queue.unassigned')}
          count={props.unassignedSummary?.countOpen ?? 0}
          icon={Users}
          filterKey="assignee"
          filterValue="unassigned"
          testId="queue-assignee-unassigned"
          clearParams={['priority']}
        />
      </div>

      {props.assignees.length > 0 && (
        <>
          <div className="border-t border-white/5 my-2" />
          <div className="space-y-0.5">
            {props.assignees.slice(0, 10).map(staff => (
              <QueueItem
                key={staff.staffId}
                label={staff.name || 'Unknown Staff'}
                count={staff.countOpen}
                // No icon for staff list to keep it clean
                filterKey="assignee"
                filterValue={`staff:${staff.staffId}`}
                testId={`queue-staff-${staff.staffId}`}
                clearParams={['priority']}
                rightElement={
                  staff.countNeedsAction > 0 ? (
                    <span
                      className="ml-auto text-[10px] font-bold text-amber-500 flex items-center gap-0.5"
                      title="Needs Action"
                    >
                      <Zap className="w-2.5 h-2.5 fill-current" />
                      {staff.countNeedsAction}
                    </span>
                  ) : null
                }
              />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
