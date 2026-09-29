import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import {
  ACTIONABLE_CLAIM_STATUSES,
  getAssignedStaffClaimAttention,
  getStaffClaimsList,
  parseDiasporaOriginFilter,
  type DiasporaOriginFilter,
} from '@interdomestik/domain-claims';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import { StaffClaimsControls } from './staff-claims-controls';
import { StaffClaimsRow } from './staff-claims-row';

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

  const attention =
    session.user.role === 'staff'
      ? await getAssignedStaffClaimAttention(
          session,
          claims.filter(claim => claim.staffId === session.user.id).map(claim => claim.id)
        )
      : {};
  const queueGroup = (claim: (typeof claims)[number]) =>
    session.user.role !== 'staff'
      ? null
      : claim.staffId !== session.user.id
        ? 'unassigned'
        : (attention[claim.id]?.nextActor ?? 'untracked');
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
          {displayedClaims.map((claim, index) => (
            <Fragment key={claim.id}>
              {queueGroup(claim) &&
              (index === 0 || queueGroup(displayedClaims[index - 1]) !== queueGroup(claim)) ? (
                <h2
                  className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900"
                  data-testid={`staff-claims-group-${queueGroup(claim)}`}
                >
                  {tClaims(`staff_queue.attention.group.${queueGroup(claim)}`)}
                </h2>
              ) : null}
              <StaffClaimsRow
                claim={claim}
                currentStaffId={session.user.id}
                locale={locale}
                attention={
                  session.user.role === 'staff' && claim.staffId === session.user.id
                    ? (attention[claim.id] ?? {
                        nextActor: 'untracked',
                        overdueFollowUpDueAt: null,
                      })
                    : null
                }
                tClaims={tClaims}
                tStatus={tStatus}
              />
            </Fragment>
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
