import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Link } from '@/i18n/routing';
import {
  ACTIONABLE_CLAIM_STATUSES,
  getStaffClaimsList,
  parseDiasporaOriginFilter,
  type DiasporaOriginFilter,
} from '@interdomestik/domain-claims';
import { Button } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { StaffClaimsControls } from './staff-claims-controls';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SearchParamValue = string | string[] | undefined;

type StaffAssignmentFilter = 'all' | 'mine' | 'unassigned';

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parseStaffAssignmentFilter(
  value: SearchParamValue,
  role: string | null | undefined
): StaffAssignmentFilter {
  const filter = getSingleParam(value);

  if (filter === 'unassigned') {
    return 'unassigned';
  }

  if (filter === 'mine' && role === 'staff') {
    return 'mine';
  }

  return 'all';
}

function parseStaffStatusFilter(value: SearchParamValue) {
  const filter = getSingleParam(value);
  return (ACTIONABLE_CLAIM_STATUSES as readonly string[]).includes(filter ?? '')
    ? (filter as (typeof ACTIONABLE_CLAIM_STATUSES)[number])
    : undefined;
}

function parseSearchTerm(value: SearchParamValue) {
  const normalized = getSingleParam(value)?.trim();
  return normalized || undefined;
}

function parseDiasporaFilter(value: SearchParamValue): DiasporaOriginFilter {
  return parseDiasporaOriginFilter(getSingleParam(value));
}

function buildStaffClaimsHref(args: {
  assigned: StaffAssignmentFilter;
  diasporaOrigin: DiasporaOriginFilter;
  search?: string;
  status?: (typeof ACTIONABLE_CLAIM_STATUSES)[number];
}) {
  const params = new URLSearchParams();

  if (args.assigned !== 'all') {
    params.set('assigned', args.assigned);
  }

  if (args.status) {
    params.set('status', args.status);
  }

  if (args.diasporaOrigin !== 'all') {
    params.set('diaspora', args.diasporaOrigin);
  }

  if (args.search) {
    params.set('search', args.search);
  }

  const query = params.toString();
  return query ? `/staff/claims?${query}` : '/staff/claims';
}

function getAssignmentStateLabel(args: {
  assigneeId: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  currentStaffId: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (args.assigneeId == null) {
    return args.t('staff_queue.assignment_state.unassigned');
  }

  if (args.assigneeId === args.currentStaffId) {
    return args.t('staff_queue.assignment_state.assigned_to_you');
  }

  const assigneeLabel = args.assigneeName || args.assigneeEmail;
  return assigneeLabel
    ? args.t('staff_queue.assignment_state.assigned_to_named', { name: assigneeLabel })
    : args.t('staff_queue.assignment_state.assigned');
}

export default async function StaffClaimsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tClaims = await getTranslations('agent-claims.claims');
  const tStatus = await getTranslations('claims-tracking.status');

  const session = requireSessionOrRedirect(await getSessionSafe('StaffClaimsPage'), locale);
  // Pilot policy: branch managers can monitor queue volume, but only staff process claims.
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  const resolvedSearchParams = await searchParams;
  const currentStatus = parseStaffStatusFilter(resolvedSearchParams.status);
  const currentSearch = parseSearchTerm(resolvedSearchParams.search);
  const currentDiasporaOrigin = parseDiasporaFilter(resolvedSearchParams.diaspora);
  const currentAssignment = parseStaffAssignmentFilter(
    resolvedSearchParams.assigned,
    session.user.role
  );

  const claims = await getStaffClaimsList({
    assignment: currentAssignment,
    branchId: session.user.branchId ?? null,
    diasporaOrigin: currentDiasporaOrigin,
    staffId: session.user.id,
    limit: 20,
    search: currentSearch,
    status: currentStatus,
    tenantId: session.user.tenantId,
    viewerRole: session.user.role,
  });

  const assignmentOptions =
    session.user.role === 'staff'
      ? [
          { value: 'all' as const, label: tClaims('staff_queue.assignment_filter.all_staff') },
          { value: 'mine' as const, label: tClaims('staff_queue.assignment_filter.mine') },
          {
            value: 'unassigned' as const,
            label: tClaims('staff_queue.assignment_state.unassigned'),
          },
        ]
      : [
          { value: 'all' as const, label: tClaims('staff_queue.assignment_filter.all_branch') },
          {
            value: 'unassigned' as const,
            label: tClaims('staff_queue.assignment_state.unassigned'),
          },
        ];
  const hasActiveFilters =
    !!currentSearch ||
    !!currentStatus ||
    currentAssignment !== 'all' ||
    currentDiasporaOrigin !== 'all';
  const hiddenFields: Array<{ name: string; value: string }> = [];
  if (currentAssignment === 'mine' || currentAssignment === 'unassigned') {
    hiddenFields.push({ name: 'assigned', value: currentAssignment });
  }
  if (currentStatus) {
    hiddenFields.push({ name: 'status', value: currentStatus });
  }
  if (currentDiasporaOrigin === 'diaspora') {
    hiddenFields.push({ name: 'diaspora', value: currentDiasporaOrigin });
  }
  const clearSearchHref = currentSearch
    ? buildStaffClaimsHref({
        assigned: currentAssignment,
        diasporaOrigin: currentDiasporaOrigin,
        status: currentStatus,
      })
    : undefined;
  const assignmentFilterOptions = assignmentOptions.map(option => ({
    ...option,
    href: buildStaffClaimsHref({
      assigned: option.value,
      diasporaOrigin: currentDiasporaOrigin,
      search: currentSearch,
      status: currentStatus,
    }),
    isActive: currentAssignment === option.value,
    testId: `staff-claims-assigned-filter-${option.value}`,
  }));
  const statusFilterOptions = [
    {
      href: buildStaffClaimsHref({
        assigned: currentAssignment,
        diasporaOrigin: currentDiasporaOrigin,
        search: currentSearch,
      }),
      isActive: !currentStatus,
      label: tClaims('staff_queue.all_actionable'),
      testId: 'staff-claims-status-filter-all',
      value: 'all',
    },
    ...ACTIONABLE_CLAIM_STATUSES.map(status => ({
      href: buildStaffClaimsHref({
        assigned: currentAssignment,
        diasporaOrigin: currentDiasporaOrigin,
        search: currentSearch,
        status,
      }),
      isActive: currentStatus === status,
      label: tStatus(status),
      testId: `staff-claims-status-filter-${status}`,
      value: status,
    })),
  ];
  const diasporaFilterOptions = [
    {
      href: buildStaffClaimsHref({
        assigned: currentAssignment,
        diasporaOrigin: 'all',
        search: currentSearch,
        status: currentStatus,
      }),
      isActive: currentDiasporaOrigin === 'all',
      label: tClaims('staff_queue.diaspora_filter.all'),
      testId: 'staff-claims-diaspora-filter-all',
      value: 'all',
    },
    {
      href: buildStaffClaimsHref({
        assigned: currentAssignment,
        diasporaOrigin: 'diaspora',
        search: currentSearch,
        status: currentStatus,
      }),
      isActive: currentDiasporaOrigin === 'diaspora',
      label: tClaims('staff_queue.diaspora_filter.diaspora'),
      testId: 'staff-claims-diaspora-filter-diaspora',
      value: 'diaspora',
    },
  ];

  return (
    <div className="space-y-6" data-testid="staff-page-ready">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          {tClaims('claims_queue')}
        </h1>

        <p className="text-muted-foreground">{tClaims('staff_queue.subtitle')}</p>
        <p
          className="mt-2 text-sm font-medium text-slate-700"
          data-testid="staff-claims-results-count"
        >
          {tClaims('staff_queue.results_count', { count: claims.length })}
        </p>
      </div>

      <StaffClaimsControls
        assignmentFilterLabel={tClaims('staff_queue.assignment_filter_label')}
        assignmentOptions={assignmentFilterOptions}
        clearSearchHref={clearSearchHref}
        clearSearchLabel={tClaims('staff_queue.clear_search')}
        currentSearch={currentSearch}
        diasporaFilterLabel={tClaims('staff_queue.diaspora_filter_label')}
        diasporaOptions={diasporaFilterOptions}
        formAction={`/${locale}/staff/claims`}
        hiddenFields={hiddenFields}
        pendingFilterLabel={tClaims('staff_queue.pending_filter')}
        pendingSearchLabel={tClaims('staff_queue.pending_search')}
        searchLabel={tClaims('staff_queue.search')}
        searchPlaceholder={tClaims('staff_queue.search_placeholder')}
        statusFilterLabel={tClaims('staff_queue.status_filter_label')}
        statusOptions={statusFilterOptions}
      />

      <div className="rounded-lg border bg-white shadow-sm" data-testid="staff-claims-queue">
        <div className="grid grid-cols-1 gap-4 border-b px-4 py-3 text-sm font-medium text-muted-foreground md:grid-cols-5">
          <span>{tClaims('staff_queue.table.claim')}</span>
          <span>{tClaims('staff_queue.table.member')}</span>
          <span>{tClaims('staff_queue.table.status_stage')}</span>
          <span>{tClaims('staff_queue.table.updated')}</span>
          <span className="text-right">{tClaims('staff_queue.table.action')}</span>
        </div>
        <div className="divide-y" data-testid="staff-claims-list">
          {claims.map(claim => (
            <div
              key={claim.id}
              className="grid grid-cols-1 items-center gap-4 px-4 py-3 text-sm md:grid-cols-5"
              data-testid="staff-claims-row"
            >
              <div>
                <div className="font-medium text-slate-900" data-testid="staff-claim-title">
                  {claim.title || claim.claimNumber || claim.id}
                </div>
                <div className="text-xs text-muted-foreground">
                  {claim.claimNumber || tClaims('staff_queue.table.no_claim_number')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {claim.companyName || tClaims('staff_queue.table.no_company')}
                </div>
                {claim.isDiasporaOrigin ? (
                  <div
                    className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                    data-testid="staff-claim-origin-badge"
                  >
                    {tClaims('staff_queue.origin_badge')}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="font-medium text-slate-900">{claim.memberName || '-'}</div>
                <div className="text-xs text-muted-foreground">
                  {claim.memberNumber
                    ? `#${claim.memberNumber}`
                    : tClaims('staff_queue.table.no_member_number')}
                </div>
              </div>
              <div>
                <ClaimStatusBadge status={claim.status} />
                <div className="mt-1 text-xs text-muted-foreground">
                  {claim.status ? tStatus(claim.status) : claim.stageLabel || '-'}
                </div>
                <div
                  className="mt-1 text-xs font-medium text-slate-700"
                  data-testid="staff-claim-assignment-state"
                >
                  {getAssignmentStateLabel({
                    assigneeId: claim.staffId,
                    assigneeName: claim.assigneeName,
                    assigneeEmail: claim.assigneeEmail,
                    currentStaffId: session.user.id,
                    t: tClaims,
                  })}
                </div>
              </div>
              <div>
                {claim.updatedAt ? new Date(claim.updatedAt).toLocaleDateString(locale) : '-'}
              </div>
              <div className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/staff/claims/${claim.id}`}
                    prefetch={false}
                    data-testid="staff-claims-view"
                  >
                    {tClaims('actions.open')}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
          {claims.length === 0 && (
            <div
              className="px-4 py-10 text-center text-muted-foreground"
              data-testid="staff-claims-empty"
            >
              {hasActiveFilters
                ? tClaims('staff_queue.empty_filtered')
                : tClaims('staff_queue.empty_default')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
