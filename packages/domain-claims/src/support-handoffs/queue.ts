import { buildOwnOrUnassignedStaffScope, normalizeNullableDate } from './queue-read-helpers';
export { getStaffSupportHandoffDetail } from './queue-detail';
import {
  and,
  branches,
  claims,
  withTenantContext,
  desc,
  eq,
  ilike,
  membershipPlans,
  or,
  subscriptions,
  supportHandoffs,
  user,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasSupportHandoffCurrentCycleMemberReply } from '@interdomestik/domain-crm/support-handoffs';
import { aliasedTable, gt, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { claimLifecycleStatusSql } from '../claims/lifecycle-read-sql';
import type {
  SupportHandoffQueueAssignmentFilter,
  SupportHandoffQueueAttentionFilter,
  SupportHandoffQueueItem,
  SupportHandoffStatus,
  SupportHandoffTrustRisk,
  SupportHandoffUrgency,
} from './types';

export type SupportHandoffClaimLinkFilter = 'all' | 'linked' | 'unlinked';

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

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

  const shouldUseOwnOrUnassignedFallback =
    args.viewerRole !== 'branch_manager' ||
    (args.viewerRole === 'branch_manager' && args.branchId == null);

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

export async function getStaffSupportHandoffQueue(params: {
  assignment?: SupportHandoffQueueAssignmentFilter;
  attention?: SupportHandoffQueueAttentionFilter;
  branchId?: string | null;
  claimLink?: SupportHandoffClaimLinkFilter;
  limit: number;
  search?: string;
  staffId: string;
  status?: SupportHandoffStatus | 'all';
  tenantId: string;
  urgency?: SupportHandoffUrgency | 'all';
  viewerRole?: string | null;
}): Promise<SupportHandoffQueueItem[]> {
  const staffUser = aliasedTable(user, 'support_handoff_staff');
  const agentUser = aliasedTable(user, 'support_handoff_agent');
  const rows = await withTenantContext({ tenantId: params.tenantId }, tx =>
    tx
      .select({
        id: supportHandoffs.id,
        subject: supportHandoffs.subject,
        message: supportHandoffs.message,
        status: supportHandoffs.status,
        urgency: supportHandoffs.urgency,
        trustRisk: supportHandoffs.trustRisk,
        lifecycleVersion: supportHandoffs.lifecycleVersion,
        memberReplyAt: supportHandoffs.memberReplyAt,
        memberReplyResponseVersion: supportHandoffs.memberReplyResponseVersion,
        publicResponseAt: supportHandoffs.publicResponseAt,
        publicResponseVersion: supportHandoffs.publicResponseVersion,
        createdAt: supportHandoffs.createdAt,
        updatedAt: supportHandoffs.updatedAt,
        staffId: supportHandoffs.staffId,
        staffName: staffUser.name,
        memberId: user.id,
        memberName: user.name,
        memberEmail: user.email,
        memberNumber: user.memberNumber,
        claimId: claims.id,
        claimNumber: claims.claimNumber,
        claimTitle: claims.title,
        claimStatus: claimLifecycleStatusSql(),
        branchName: branches.name,
        planName: membershipPlans.name,
        membershipStatus: subscriptions.status,
        agentName: agentUser.name,
      })
      .from(supportHandoffs)
      .leftJoin(
        user,
        and(eq(supportHandoffs.memberId, user.id), eq(user.tenantId, params.tenantId))
      )
      .leftJoin(
        staffUser,
        and(eq(supportHandoffs.staffId, staffUser.id), eq(staffUser.tenantId, params.tenantId))
      )
      .leftJoin(
        claims,
        and(eq(supportHandoffs.claimId, claims.id), eq(claims.tenantId, params.tenantId))
      )
      .leftJoin(
        branches,
        and(eq(supportHandoffs.branchId, branches.id), eq(branches.tenantId, params.tenantId))
      )
      .leftJoin(
        subscriptions,
        and(
          eq(supportHandoffs.memberId, subscriptions.userId),
          eq(subscriptions.tenantId, params.tenantId)
        )
      )
      .leftJoin(
        membershipPlans,
        and(
          eq(subscriptions.planKey, membershipPlans.id),
          eq(membershipPlans.tenantId, params.tenantId)
        )
      )
      .leftJoin(
        agentUser,
        and(eq(subscriptions.agentId, agentUser.id), eq(agentUser.tenantId, params.tenantId))
      )
      .where(
        buildStaffSupportHandoffQueueScope({
          assignment: params.assignment ?? 'all',
          attention: params.attention ?? 'all',
          branchId: params.branchId,
          claimLink: params.claimLink ?? 'all',
          search: params.search,
          staffId: params.staffId,
          status: params.status ?? 'open',
          tenantId: params.tenantId,
          urgency: params.urgency ?? 'all',
          viewerRole: params.viewerRole,
        })
      )
      .orderBy(desc(supportHandoffs.createdAt), desc(supportHandoffs.id))
      .limit(params.limit)
  );

  return rows.map(row => ({
    id: row.id,
    subject: row.subject,
    message: row.message,
    status: row.status as SupportHandoffStatus,
    urgency: row.urgency as SupportHandoffUrgency,
    trustRisk: row.trustRisk as SupportHandoffTrustRisk,
    lifecycleVersion: row.lifecycleVersion,
    needsFollowUp:
      row.status === 'accepted' &&
      hasSupportHandoffCurrentCycleMemberReply({
        memberReplyAt: normalizeNullableDate(row.memberReplyAt),
        memberReplyResponseVersion: row.memberReplyResponseVersion ?? null,
        publicResponseVersion: row.publicResponseVersion ?? 0,
      }),
    publicResponseAt: normalizeNullableDate(row.publicResponseAt),
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
    staffId: row.staffId ?? null,
    staffName: row.staffName ?? null,
    member: {
      id: row.memberId ?? '',
      name: row.memberName ?? '',
      email: row.memberEmail ?? null,
      memberNumber: row.memberNumber ?? null,
    },
    claim: row.claimId
      ? {
          id: row.claimId,
          claimNumber: row.claimNumber ?? null,
          title: row.claimTitle ?? null,
          status: row.claimStatus ?? null,
        }
      : null,
    relationship: {
      branchName: row.branchName ?? null,
      planName: row.planName ?? null,
      membershipStatus: row.membershipStatus ?? null,
      agentName: row.agentName ?? null,
    },
  }));
}
