import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { authorizeStaffClaimPage } from '@/features/staff/claims/server/authorize-staff-claim-page';
import {
  ACTIONABLE_CLAIM_STATUSES,
  getAssignedStaffClaimAttention,
  getStaffClaimsList,
  parseDiasporaOriginFilter,
  type DiasporaOriginFilter,
} from '@interdomestik/domain-claims';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { StaffClaimsControls } from './staff-claims-controls';
import { StaffClaimsQueue } from './staff-claims-queue';
import { StaffClaimsRow } from './staff-claims-row';
import { getSingleParam, parseStaffAssignmentFilter, buildStaffClaimsHref } from './_claims-href';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type SearchParamValue = string | string[] | undefined;

export type StaffAssignmentFilter = 'all' | 'mine' | 'unassigned';

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

// The settled announcement names the committed query, so two results of equal size still change it.
function buildResultsSummary(args: {
  count: number;
  filterOptions: ReadonlyArray<{ isActive: boolean; label: string; value: string }>;
  search?: string;
  tClaims: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { count, filterOptions, search, tClaims } = args;
  const resultsCount = search
    ? tClaims('staff_queue.results_count_search', { count, search })
    : tClaims('staff_queue.results_count', { count });
  const activeFilterLabels = filterOptions
    .filter(option => option.isActive && option.value !== 'all')
    .map(option => option.label);
  const resultsFilters =
    activeFilterLabels.length > 0
      ? tClaims('staff_queue.results_filters', {
          filters: activeFilterLabels.join(tClaims('staff_queue.results_filter_separator')),
        })
      : null;
  return { resultsCount, resultsFilters };
}

export default async function StaffClaimsPage({
  params,
  searchParams,
}: Props): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const tClaims = await getTranslations({ locale, namespace: 'agent-claims.claims' });
  const tStatus = await getTranslations({ locale, namespace: 'claims-tracking.status' });

  const session = requireSessionOrRedirect(await getSessionSafe('StaffClaimsPage'), locale);
  // Pilot policy: branch managers can monitor queue volume, but only staff process claims.
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  // The readers derive actor, role and branch from this authority, so it must match this session.
  const authority = await authorizeStaffClaimPage(session.user);
  if (!authority) return notFound();

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
    diasporaOrigin: currentDiasporaOrigin,
    limit: 20,
    search: currentSearch,
    status: currentStatus,
    authority,
  });
  if (!claims) return notFound();

  const attention =
    session.user.role === 'staff'
      ? await getAssignedStaffClaimAttention(
          session,
          authority,
          claims.filter(claim => claim.staffId === session.user.id).map(claim => claim.id)
        )
      : {};
  const queueGroup = (
    claim: (typeof claims)[number]
  ): 'staff' | 'member' | 'untracked' | 'unassigned' | null => {
    if (session.user.role !== 'staff') return null;
    if (claim.staffId !== session.user.id) return 'unassigned';
    return attention[claim.id]?.nextActor ?? 'untracked';
  };
  const groupOrder = { staff: 0, member: 1, untracked: 2, unassigned: 3 } as const;
  const displayedClaims =
    session.user.role === 'staff'
      ? [...claims].sort(
          (left, right) =>
            (groupOrder[queueGroup(left)!] ?? 3) - (groupOrder[queueGroup(right)!] ?? 3)
        )
      : claims;
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

  const { resultsCount, resultsFilters } = buildResultsSummary({
    count: claims.length,
    filterOptions: [...assignmentFilterOptions, ...statusFilterOptions, ...diasporaFilterOptions],
    search: currentSearch,
    tClaims,
  });

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]" data-testid="staff-page-ready">
      <header className="space-y-2">
        <h1
          className="text-3xl font-bold tracking-tight"
          data-testid="page-title"
          id="staff-claims-title"
        >
          {tClaims('claims_queue')}
        </h1>
        <p className="text-muted-foreground">{tClaims('staff_queue.subtitle')}</p>
        <p className="text-sm font-medium" data-testid="staff-claims-results-count" role="status">
          {resultsCount}
          {resultsFilters && <> {resultsFilters}</>}
        </p>
      </header>

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
        searchInputLabel={tClaims('staff_queue.search_label')}
        searchLabel={tClaims('staff_queue.search')}
        searchPlaceholder={tClaims('staff_queue.search_placeholder')}
        statusFilterLabel={tClaims('staff_queue.status_filter_label')}
        statusOptions={statusFilterOptions}
      />

      <StaffClaimsQueue
        claims={displayedClaims}
        getGroup={queueGroup}
        hasActiveFilters={hasActiveFilters}
        renderRow={(claim, heading) => (
          <StaffClaimsRow
            key={claim.id}
            claim={claim}
            currentStaffId={session.user.id}
            heading={heading}
            locale={locale}
            attention={
              session.user.role === 'staff' && claim.staffId === session.user.id
                ? (attention[claim.id] ?? { nextActor: 'untracked', overdueFollowUpDueAt: null })
                : null
            }
            tClaims={tClaims}
          />
        )}
        tClaims={tClaims}
      />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
