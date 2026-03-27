import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Link } from '@/i18n/routing';
import { ACTIONABLE_CLAIM_STATUSES, getStaffClaimsList } from '@interdomestik/domain-claims';
import { Button, Input } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SearchParamValue = string | string[] | undefined;

const STAFF_ASSIGNMENT_FILTERS = ['all', 'mine', 'unassigned'] as const;
type StaffAssignmentFilter = (typeof STAFF_ASSIGNMENT_FILTERS)[number];

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

function buildStaffClaimsHref(args: {
  assigned: StaffAssignmentFilter;
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
  const currentAssignment = parseStaffAssignmentFilter(
    resolvedSearchParams.assigned,
    session.user.role
  );

  const claims = await getStaffClaimsList({
    assignment: currentAssignment,
    branchId: session.user.branchId ?? null,
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
  const hasActiveFilters = !!currentSearch || !!currentStatus || currentAssignment !== 'all';

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

      <section
        className="rounded-lg border bg-white p-4 shadow-sm"
        data-testid="staff-claims-filters"
      >
        <form
          action={`/${locale}/staff/claims`}
          className="flex flex-col gap-3 md:flex-row md:items-center"
        >
          {currentAssignment !== 'all' && (
            <input type="hidden" name="assigned" value={currentAssignment} />
          )}
          {currentStatus && <input type="hidden" name="status" value={currentStatus} />}
          <Input
            name="search"
            defaultValue={currentSearch}
            placeholder={tClaims('staff_queue.search_placeholder')}
            data-testid="staff-claims-search-input"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" data-testid="staff-claims-search-submit">
              {tClaims('staff_queue.search')}
            </Button>
            {currentSearch && (
              <Button asChild type="button" variant="ghost">
                <Link
                  href={buildStaffClaimsHref({
                    assigned: currentAssignment,
                    status: currentStatus,
                  })}
                  prefetch={false}
                >
                  {tClaims('staff_queue.clear_search')}
                </Link>
              </Button>
            )}
          </div>
        </form>

        <div className="mt-4 space-y-2" data-testid="staff-claims-assignment-filters">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tClaims('staff_queue.assignment_filter_label')}
          </p>
          <div className="flex flex-wrap gap-2">
            {assignmentOptions.map(option => {
              const isActive = currentAssignment === option.value;
              return (
                <Button
                  asChild
                  key={option.value}
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                >
                  <Link
                    href={buildStaffClaimsHref({
                      assigned: option.value,
                      search: currentSearch,
                      status: currentStatus,
                    })}
                    prefetch={false}
                    data-testid={`staff-claims-assigned-filter-${option.value}`}
                  >
                    {option.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 space-y-2" data-testid="staff-claims-status-filters">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tClaims('staff_queue.status_filter_label')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={currentStatus ? 'outline' : 'default'}>
              <Link
                href={buildStaffClaimsHref({
                  assigned: currentAssignment,
                  search: currentSearch,
                })}
                prefetch={false}
                data-testid="staff-claims-status-filter-all"
              >
                {tClaims('staff_queue.all_actionable')}
              </Link>
            </Button>
            {ACTIONABLE_CLAIM_STATUSES.map(status => {
              const isActive = currentStatus === status;
              return (
                <Button asChild key={status} size="sm" variant={isActive ? 'default' : 'outline'}>
                  <Link
                    href={buildStaffClaimsHref({
                      assigned: currentAssignment,
                      search: currentSearch,
                      status,
                    })}
                    prefetch={false}
                    data-testid={`staff-claims-status-filter-${status}`}
                  >
                    {tStatus(status)}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      </section>

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
