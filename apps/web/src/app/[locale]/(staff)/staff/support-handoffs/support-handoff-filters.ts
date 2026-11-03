import type { SupportHandoffClaimLinkFilter } from '@interdomestik/domain-claims/support-handoffs/queue';
import type {
  SupportHandoffQueueAssignmentFilter,
  SupportHandoffQueueAttentionFilter,
  SupportHandoffStatus,
  SupportHandoffUrgency,
} from '@interdomestik/domain-claims/support-handoffs/types';

export type SearchParamValue = string | string[] | undefined;

export const STATUS_FILTERS = ['all', 'open', 'accepted', 'closed'] as const;
export const URGENCY_FILTERS = ['all', 'critical', 'high', 'normal', 'low'] as const;
export const CLAIM_LINK_FILTERS = ['all', 'linked', 'unlinked'] as const;
export const ATTENTION_FILTERS = ['all', 'needs_follow_up'] as const;

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function isOneOf<T extends readonly string[]>(
  values: T,
  value: string | undefined
): value is T[number] {
  return !!value && values.includes(value);
}

export function parseAssignmentFilter(
  value: SearchParamValue,
  role: string | null | undefined
): SupportHandoffQueueAssignmentFilter {
  const filter = getSingleParam(value);
  if (filter === 'unassigned') return 'unassigned';
  if (filter === 'mine' && role === 'staff') return 'mine';
  return 'all';
}

export function parseStatusFilter(
  value: SearchParamValue,
  attention: SupportHandoffQueueAttentionFilter
): SupportHandoffStatus | 'all' {
  if (attention === 'needs_follow_up') return 'accepted';

  const filter = getSingleParam(value);
  if (isOneOf(STATUS_FILTERS, filter)) return filter;
  return 'open';
}

export function parseUrgencyFilter(value: SearchParamValue): SupportHandoffUrgency | 'all' {
  const filter = getSingleParam(value);
  return isOneOf(URGENCY_FILTERS, filter) ? filter : 'all';
}

export function parseClaimLinkFilter(value: SearchParamValue): SupportHandoffClaimLinkFilter {
  const filter = getSingleParam(value);
  return isOneOf(CLAIM_LINK_FILTERS, filter) ? filter : 'all';
}

export function parseAttentionFilter(value: SearchParamValue): SupportHandoffQueueAttentionFilter {
  const filter = getSingleParam(value);
  return isOneOf(ATTENTION_FILTERS, filter) ? filter : 'all';
}

export function parseSearchTerm(value: SearchParamValue) {
  const normalized = getSingleParam(value)?.trim().replace(/\s+/g, ' ').slice(0, 80);
  return normalized || undefined;
}

export function buildSupportHandoffsHref(args: {
  assigned: SupportHandoffQueueAssignmentFilter;
  attention: SupportHandoffQueueAttentionFilter;
  claim: SupportHandoffClaimLinkFilter;
  search?: string;
  status: SupportHandoffStatus | 'all';
  urgency: SupportHandoffUrgency | 'all';
}) {
  const params = new URLSearchParams();
  if (args.assigned !== 'all') params.set('assigned', args.assigned);
  if (args.attention !== 'all') params.set('attention', args.attention);
  if (args.status !== 'open') params.set('status', args.status);
  if (args.urgency !== 'all') params.set('urgency', args.urgency);
  if (args.claim !== 'all') params.set('claim', args.claim);
  if (args.search) params.set('search', args.search);
  const query = params.toString();
  return query ? `/staff/support-handoffs?${query}` : '/staff/support-handoffs';
}

export function getFilterOptions<T extends string>(args: {
  current: T;
  labels: Record<T, string>;
  values: readonly T[];
  toHref: (value: T) => string;
  testPrefix: string;
}) {
  return args.values.map(value => ({
    href: args.toHref(value),
    isActive: args.current === value,
    label: args.labels[value],
    testId: `${args.testPrefix}-${value}`,
    value,
  }));
}
