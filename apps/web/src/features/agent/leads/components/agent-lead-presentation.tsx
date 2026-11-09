'use client';

import { OpsStatusBadge } from '@/components/ops/OpsStatusBadge';
import { OpsTimeline } from '@/components/ops/OpsTimeline';
import { toOpsStatus, toOpsTimelineEvents } from '@/components/ops/adapters/leads';
import { useTranslations } from 'next-intl';

export type AgentLeadPro = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  branchId?: string | null;
  branch?: { name?: string | null } | null;
  leadKind?: string | null;
  companyName?: string | null;
  teamSize?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export function useAgentLeadRows(
  leads: AgentLeadPro[],
  onSelect: (id: string) => void,
  localizeLeadStatus: (status: string | null | undefined) => string
) {
  const t = useTranslations('agent.leads_pro');
  const columns = [
    { key: 'lead', header: t('columns.lead') },
    { key: 'status', header: t('columns.status') },
    { key: 'details', header: t('columns.details') },
    { key: 'meta', header: t('columns.meta') },
  ];
  const tableRows = leads.map(lead => {
    return {
      id: lead.id,
      cells: [
        <div key="lead" className="flex flex-col py-1">
          <span className="font-medium text-foreground">
            {lead.firstName} {lead.lastName}
          </span>
          <span className="text-sm text-muted-foreground">{lead.email}</span>
        </div>,
        <div key="status">
          <OpsStatusBadge {...toOpsStatus(lead.status)} label={localizeLeadStatus(lead.status)} />
        </div>,
        <div key="details" className="flex flex-col text-sm">
          <span>{lead.phone || '-'}</span>
          <span className="text-xs text-muted-foreground">
            {lead.branch?.name || lead.branchId || ''}
          </span>
        </div>,
        <div key="meta" className="flex flex-col text-sm text-muted-foreground">
          <span>{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}</span>
          <span className="text-xs">
            {/* Abstracting "Last Touch" as updated at for now */}
            {lead.updatedAt
              ? `${t('fields.updated')} ${new Date(lead.updatedAt).toLocaleDateString()}`
              : ''}
          </span>
        </div>,
      ],
      onClick: () => onSelect(lead.id),
      testId: `lead-row-${lead.id}`,
    };
  });

  return { columns, tableRows };
}

export function AgentLeadTimeline({ lead }: Readonly<{ lead: AgentLeadPro }>) {
  const t = useTranslations('agent.leads_pro');
  return (
    <OpsTimeline
      title={t('timeline.title')}
      events={toOpsTimelineEvents(lead).map(event => {
        if (event.id.endsWith('-created')) {
          return {
            ...event,
            title: t('timeline.events.created.title'),
            description: `${t('timeline.events.created.source_prefix')} ${
              lead.source || t('timeline.events.created.unknown_source')
            }`,
          };
        }

        if (event.id.endsWith('-converted')) {
          return {
            ...event,
            title: t('timeline.events.converted.title'),
            description: t('timeline.events.converted.description'),
          };
        }

        return event;
      })}
      emptyLabel={t('timeline.empty')}
    />
  );
}
