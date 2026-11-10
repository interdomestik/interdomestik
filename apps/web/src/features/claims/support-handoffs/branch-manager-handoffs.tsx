import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CommunicationRetry } from '../communication/communication-retry';
import { getHandoffMetadata } from './get-handoff-metadata';
import { HandoffMetadataFields, type MetadataLabels } from './handoff-metadata-fields';
import { HandoffMetadataPanel } from './handoff-metadata-panel';
import { HandoffMetadataFilters, type HandoffFilterGroup } from './handoff-metadata-filters';
import {
  parseAssignmentFilter,
  parseAttentionFilter,
  parseClaimLinkFilter,
  parseSearchTerm,
  parseStatusFilter,
  parseUrgencyFilter,
} from '@/app/[locale]/(staff)/staff/support-handoffs/support-handoff-filters';

export async function BranchManagerHandoffs({
  authority,
  params,
  searchParams,
}: {
  authority: TenantAuthority | null;
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent-claims.claims.support_handoffs');
  const c = await getTranslations('messaging.branchManager');
  const query = await searchParams;
  const attention = parseAttentionFilter(query.attention);
  const assignment = parseAssignmentFilter(query.assigned, 'branch_manager');
  const filters = {
    assignment: assignment === 'unassigned' ? ('unassigned' as const) : ('all' as const),
    attention,
    claimLink: parseClaimLinkFilter(query.claim),
    status: parseStatusFilter(query.status, attention),
    urgency: parseUrgencyFilter(query.urgency),
    search: parseSearchTerm(query.search),
  };
  const result = authority
    ? await getHandoffMetadata({ authority, filters })
    : { kind: 'unavailable' as const };
  const fields = Object.fromEntries(
    [
      'status',
      'branch',
      'assignee',
      'createdAt',
      'updatedAt',
      'acceptedAt',
      'reassignedAt',
      'closedAt',
      'publicResponseAt',
      'publicResponseCount',
      'memberReplyAt',
    ].map(key => [key, c(`handoffs.${key}`)])
  ) as MetadataLabels;
  const statuses = {
    open: t('status.open'),
    accepted: t('status.accepted'),
    closed: t('status.closed'),
  };
  const missing = {
    timestamp: c('noTimestamp'),
    assignee: t('table.unassigned'),
    branch: t('table.no_branch'),
  };
  const panelLabels = {
    expand: t('detail.expand'),
    collapse: t('detail.collapse'),
    loading: c('loading'),
    unavailable: c('unavailable'),
    failed: c('failed'),
    retry: c('retry'),
  };
  const groups: HandoffFilterGroup[] = [
    {
      name: 'assigned',
      value: filters.assignment,
      label: t('filters.assignment.label'),
      options: {
        all: t('filters.assignment.all_branch'),
        unassigned: t('filters.assignment.unassigned'),
      },
    },
    {
      name: 'status',
      value: filters.status,
      label: t('filters.status.label'),
      options: { all: t('filters.status.all'), ...statuses },
    },
    {
      name: 'urgency',
      value: filters.urgency,
      label: t('filters.urgency.label'),
      options: {
        all: t('filters.urgency.all'),
        critical: t('urgency.critical'),
        high: t('urgency.high'),
        normal: t('urgency.normal'),
        low: t('urgency.low'),
      },
    },
    {
      name: 'claim',
      value: filters.claimLink,
      label: t('filters.claim.label'),
      options: {
        all: t('filters.claim.all'),
        linked: t('filters.claim.linked'),
        unlinked: t('filters.claim.unlinked'),
      },
    },
    {
      name: 'attention',
      value: filters.attention,
      label: t('filters.attention.label'),
      options: {
        all: t('filters.attention.all'),
        needs_follow_up: t('filters.attention.needs_follow_up'),
      },
    },
  ];
  return (
    <div className="space-y-6" data-testid="staff-page-ready">
      <h1 className="text-3xl font-bold" data-testid="page-title">
        {t('title')}
      </h1>
      <p data-testid="staff-support-handoffs-readonly-notice">{c('handoffs.restriction')}</p>
      <HandoffMetadataFilters
        locale={locale}
        search={filters.search ?? ''}
        groups={groups}
        searchLabel={c('handoffs.search')}
        submitLabel={t('filters.search')}
      />
      <section
        aria-label={c('handoffs.title')}
        data-testid="staff-support-handoffs-queue"
        className="space-y-4"
      >
        {result.kind !== 'ok' ? (
          <p role="status">{c(result.kind)}</p>
        ) : (
          <>
            <p role="status">{c('handoffs.count', { count: result.data.length })}</p>
            {result.data.length === 0 && (
              <p data-testid="staff-support-handoffs-empty">{t('empty')}</p>
            )}
            <div data-testid="staff-support-handoffs-list" className="space-y-4">
              {result.data.map(row => (
                <article
                  key={row.id}
                  data-handoff-id={row.id}
                  data-testid="staff-support-handoffs-row"
                  className="space-y-4 rounded border p-4"
                >
                  <h2 className="break-all font-semibold">{row.id}</h2>
                  <HandoffMetadataFields
                    data={row}
                    labels={fields}
                    locale={locale}
                    missing={missing}
                    statuses={statuses}
                  />
                  <HandoffMetadataPanel
                    handoffId={row.id}
                    fields={fields}
                    labels={panelLabels}
                    locale={locale}
                    missing={missing}
                    statuses={statuses}
                  />
                </article>
              ))}
            </div>
          </>
        )}
        <CommunicationRetry label={c('retry')} loading={c('loading')} />
      </section>
    </div>
  );
}
