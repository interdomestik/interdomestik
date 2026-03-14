import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { ACTIONABLE_CLAIM_STATUSES, getStaffClaimsList } from '@interdomestik/domain-claims';
import { Button, Input } from '@interdomestik/ui';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
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

function toLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  locale: string;
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
  return query ? `/${args.locale}/staff/claims?${query}` : `/${args.locale}/staff/claims`;
}

export default async function StaffClaimsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound();
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
  });

  const assignmentOptions =
    session.user.role === 'staff'
      ? [
          { value: 'all' as const, label: 'My queue + unassigned' },
          { value: 'mine' as const, label: 'Assigned to me' },
          { value: 'unassigned' as const, label: 'Unassigned' },
        ]
      : [
          { value: 'all' as const, label: 'All branch claims' },
          { value: 'unassigned' as const, label: 'Unassigned' },
        ];
  const hasActiveFilters = !!currentSearch || !!currentStatus || currentAssignment !== 'all';

  return (
    <div className="space-y-6" data-testid="staff-page-ready">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          Claims Queue
        </h1>

        <p className="text-muted-foreground">What needs action today.</p>
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
            placeholder="Search claim, member, company, or number"
            data-testid="staff-claims-search-input"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" data-testid="staff-claims-search-submit">
              Search
            </Button>
            {currentSearch && (
              <Button asChild type="button" variant="ghost">
                <Link
                  href={buildStaffClaimsHref({
                    assigned: currentAssignment,
                    locale,
                    status: currentStatus,
                  })}
                  prefetch={false}
                >
                  Clear
                </Link>
              </Button>
            )}
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
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
                    locale,
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

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant={currentStatus ? 'outline' : 'default'}>
            <Link
              href={buildStaffClaimsHref({
                assigned: currentAssignment,
                locale,
                search: currentSearch,
              })}
              prefetch={false}
              data-testid="staff-claims-status-filter-all"
            >
              All actionable
            </Link>
          </Button>
          {ACTIONABLE_CLAIM_STATUSES.map(status => {
            const isActive = currentStatus === status;
            return (
              <Button asChild key={status} size="sm" variant={isActive ? 'default' : 'outline'}>
                <Link
                  href={buildStaffClaimsHref({
                    assigned: currentAssignment,
                    locale,
                    search: currentSearch,
                    status,
                  })}
                  prefetch={false}
                  data-testid={`staff-claims-status-filter-${status}`}
                >
                  {toLabel(status)}
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

      <div className="rounded-lg border bg-white shadow-sm" data-testid="staff-claims-queue">
        <div className="grid grid-cols-1 gap-4 border-b px-4 py-3 text-sm font-medium text-muted-foreground md:grid-cols-5">
          <span>Claim</span>
          <span>Member</span>
          <span>Status + stage</span>
          <span>Updated</span>
          <span className="text-right">Action</span>
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
                  {claim.claimNumber || 'No claim number'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {claim.companyName || 'No company provided'}
                </div>
              </div>
              <div>
                <div className="font-medium text-slate-900">{claim.memberName || '-'}</div>
                <div className="text-xs text-muted-foreground">
                  {claim.memberNumber ? `#${claim.memberNumber}` : 'No member number'}
                </div>
              </div>
              <div>
                <ClaimStatusBadge status={claim.status} />
                <div className="mt-1 text-xs text-muted-foreground">{claim.stageLabel}</div>
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
                    Open
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
              {hasActiveFilters ? 'No claims match the current filters' : 'No claims in queue'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
