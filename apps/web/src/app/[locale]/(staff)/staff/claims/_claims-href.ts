import { ACTIONABLE_CLAIM_STATUSES, type DiasporaOriginFilter } from '@interdomestik/domain-claims';
import type { SearchParamValue, StaffAssignmentFilter } from './_core.entry';

export function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseStaffAssignmentFilter(
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

export function buildStaffClaimsHref(args: {
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
