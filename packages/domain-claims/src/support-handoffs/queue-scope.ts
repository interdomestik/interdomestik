import { and, claims, eq, ilike, or, supportHandoffs, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { gt, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type {
  SupportHandoffQueueAssignmentFilter,
  SupportHandoffQueueAttentionFilter,
  SupportHandoffStatus,
  SupportHandoffUrgency,
} from './types';

export type SupportHandoffClaimLinkFilter = 'all' | 'linked' | 'unlinked';

function normalizeSearch(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, 80);
  return normalized && normalized.length >= 2 ? normalized : undefined;
}

function buildSearchCondition(term: string) {
  const pattern = `%${term}%`;
  return or(
    ilike(supportHandoffs.subject, pattern),
    ilike(supportHandoffs.message, pattern),
    ilike(user.name, pattern),
    ilike(user.email, pattern),
    ilike(user.memberNumber, pattern),
    ilike(claims.claimNumber, pattern),
    ilike(claims.title, pattern)
  );
}

export function buildOwnOrUnassignedStaffScope(staffId: string): SQL<unknown> {
  const scope = or(eq(supportHandoffs.staffId, staffId), isNull(supportHandoffs.staffId));
  if (!scope) {
    throw new Error('Expected own-or-unassigned support handoff scope');
  }
  return scope;
}

function buildNeedsFollowUpCondition(): SQL<unknown> {
  return and(
    eq(supportHandoffs.status, 'accepted'),
    gt(supportHandoffs.publicResponseVersion, 0),
    isNotNull(supportHandoffs.memberReplyAt),
    eq(supportHandoffs.memberReplyResponseVersion, supportHandoffs.publicResponseVersion)
  ) as SQL<unknown>;
}

function buildAssignmentCondition(args: {
  assignment: SupportHandoffQueueAssignmentFilter;
  branchId?: string | null;
  staffId: string;
  viewerRole?: string | null;
}): SQL<unknown> | undefined {
  if (args.assignment === 'mine') {
    return eq(supportHandoffs.staffId, args.staffId);
  }

  if (args.assignment === 'unassigned') {
    return isNull(supportHandoffs.staffId);
  }

  const shouldUseOwnOrUnassignedFallback = args.viewerRole !== 'branch_manager';

  return shouldUseOwnOrUnassignedFallback
    ? buildOwnOrUnassignedStaffScope(args.staffId)
    : undefined;
}

function buildClaimLinkCondition(
  claimLink: SupportHandoffClaimLinkFilter | undefined
): SQL<unknown> | undefined {
  if (claimLink === 'linked') {
    return isNotNull(supportHandoffs.claimId);
  }

  return claimLink === 'unlinked' ? isNull(supportHandoffs.claimId) : undefined;
}

export function buildStaffSupportHandoffQueueScope(args: {
  assignment: SupportHandoffQueueAssignmentFilter;
  attention?: SupportHandoffQueueAttentionFilter;
  branchId?: string | null;
  claimLink?: SupportHandoffClaimLinkFilter;
  search?: string;
  staffId: string;
  status?: SupportHandoffStatus | 'all';
  tenantId: string;
  urgency?: SupportHandoffUrgency | 'all';
  viewerRole?: string | null;
}) {
  const conditions: SQL<unknown>[] = [];
  if (args.viewerRole === 'branch_manager' && !args.branchId?.trim()) {
    conditions.push(sql`false`);
  }

  if (args.attention !== 'needs_follow_up' && args.status && args.status !== 'all') {
    conditions.push(eq(supportHandoffs.status, args.status));
  }

  if (args.urgency && args.urgency !== 'all') {
    conditions.push(eq(supportHandoffs.urgency, args.urgency));
  }

  if (args.branchId != null) {
    conditions.push(eq(supportHandoffs.branchId, args.branchId));
  }

  const assignmentCondition = buildAssignmentCondition(args);
  if (assignmentCondition) conditions.push(assignmentCondition);

  const claimLinkCondition = buildClaimLinkCondition(args.claimLink);
  if (claimLinkCondition) conditions.push(claimLinkCondition);

  if (args.attention === 'needs_follow_up') {
    conditions.push(buildNeedsFollowUpCondition());
  }

  const search = normalizeSearch(args.search);
  if (search) {
    const searchCondition = buildSearchCondition(search);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return withTenant(
    args.tenantId,
    supportHandoffs.tenantId,
    conditions.length > 0 ? and(...conditions) : undefined
  );
}
