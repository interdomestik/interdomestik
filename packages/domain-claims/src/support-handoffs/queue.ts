import {
  and,
  branches,
  claims,
  db,
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
import { aliasedTable, isNotNull, isNull, type SQL } from 'drizzle-orm';

import type {
  SupportHandoffContactPreference,
  SupportHandoffDetailFields,
  SupportHandoffQueueAssignmentFilter,
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

function normalizeNullableDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeContactPreference(
  value: string | null | undefined
): SupportHandoffContactPreference {
  if (value === 'phone' || value === 'email' || value === 'whatsapp' || value === 'staff_reply') {
    return value;
  }
  return 'staff_reply';
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

function buildOwnOrUnassignedStaffScope(staffId: string): SQL<unknown> {
  const scope = or(eq(supportHandoffs.staffId, staffId), isNull(supportHandoffs.staffId));
  if (!scope) {
    throw new Error('Expected own-or-unassigned support handoff scope');
  }
  return scope;
}

export function buildStaffSupportHandoffQueueScope(args: {
  assignment: SupportHandoffQueueAssignmentFilter;
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

  if (args.status && args.status !== 'all') {
    conditions.push(eq(supportHandoffs.status, args.status));
  }

  if (args.urgency && args.urgency !== 'all') {
    conditions.push(eq(supportHandoffs.urgency, args.urgency));
  }

  if (args.branchId != null) {
    conditions.push(eq(supportHandoffs.branchId, args.branchId));
  }

  const shouldUseOwnOrUnassignedFallback =
    args.viewerRole !== 'branch_manager' ||
    (args.viewerRole === 'branch_manager' && args.branchId == null);

  if (args.assignment === 'mine') {
    conditions.push(eq(supportHandoffs.staffId, args.staffId));
  } else if (args.assignment === 'unassigned') {
    conditions.push(isNull(supportHandoffs.staffId));
  } else if (shouldUseOwnOrUnassignedFallback) {
    conditions.push(buildOwnOrUnassignedStaffScope(args.staffId));
  }

  if (args.claimLink === 'linked') {
    conditions.push(isNotNull(supportHandoffs.claimId));
  } else if (args.claimLink === 'unlinked') {
    conditions.push(isNull(supportHandoffs.claimId));
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
  const rows = await db
    .select({
      id: supportHandoffs.id,
      subject: supportHandoffs.subject,
      message: supportHandoffs.message,
      status: supportHandoffs.status,
      urgency: supportHandoffs.urgency,
      trustRisk: supportHandoffs.trustRisk,
      lifecycleVersion: supportHandoffs.lifecycleVersion,
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
      claimStatus: claims.status,
      branchName: branches.name,
      planName: membershipPlans.name,
      membershipStatus: subscriptions.status,
      agentName: agentUser.name,
    })
    .from(supportHandoffs)
    .leftJoin(user, and(eq(supportHandoffs.memberId, user.id), eq(user.tenantId, params.tenantId)))
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
    .limit(params.limit);

  return rows.map(row => ({
    id: row.id,
    subject: row.subject,
    message: row.message,
    status: row.status as SupportHandoffStatus,
    urgency: row.urgency as SupportHandoffUrgency,
    trustRisk: row.trustRisk as SupportHandoffTrustRisk,
    lifecycleVersion: row.lifecycleVersion,
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

export async function getStaffSupportHandoffDetail(params: {
  branchId?: string | null;
  handoffId: string;
  staffId: string;
  tenantId: string;
  viewerRole?: string | null;
}): Promise<SupportHandoffDetailFields | null> {
  const acceptedByUser = aliasedTable(user, 'support_handoff_accepted_by');
  const reassignedByUser = aliasedTable(user, 'support_handoff_reassigned_by');
  const closedByUser = aliasedTable(user, 'support_handoff_closed_by');
  const conditions: SQL<unknown>[] = [eq(supportHandoffs.id, params.handoffId)];

  if (params.branchId != null) {
    conditions.push(eq(supportHandoffs.branchId, params.branchId));
  }

  const shouldUseOwnOrUnassignedFallback =
    params.viewerRole !== 'branch_manager' ||
    (params.viewerRole === 'branch_manager' && params.branchId == null);

  if (shouldUseOwnOrUnassignedFallback) {
    conditions.push(buildOwnOrUnassignedStaffScope(params.staffId));
  }

  const rows = await db
    .select({
      contactPreference: supportHandoffs.contactPreference,
      source: supportHandoffs.source,
      acceptedAt: supportHandoffs.acceptedAt,
      acceptedByName: acceptedByUser.name,
      reassignedAt: supportHandoffs.reassignedAt,
      reassignedByName: reassignedByUser.name,
      reassignReason: supportHandoffs.reassignReason,
      closedAt: supportHandoffs.closedAt,
      closedByName: closedByUser.name,
      closeReason: supportHandoffs.closeReason,
    })
    .from(supportHandoffs)
    .leftJoin(
      acceptedByUser,
      and(
        eq(supportHandoffs.acceptedById, acceptedByUser.id),
        eq(acceptedByUser.tenantId, params.tenantId)
      )
    )
    .leftJoin(
      reassignedByUser,
      and(
        eq(supportHandoffs.reassignedById, reassignedByUser.id),
        eq(reassignedByUser.tenantId, params.tenantId)
      )
    )
    .leftJoin(
      closedByUser,
      and(
        eq(supportHandoffs.closedById, closedByUser.id),
        eq(closedByUser.tenantId, params.tenantId)
      )
    )
    .where(withTenant(params.tenantId, supportHandoffs.tenantId, and(...conditions)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    contactPreference: normalizeContactPreference(row.contactPreference),
    source: row.source,
    acceptedAt: normalizeNullableDate(row.acceptedAt),
    acceptedByName: row.acceptedByName ?? null,
    reassignedAt: normalizeNullableDate(row.reassignedAt),
    reassignedByName: row.reassignedByName ?? null,
    reassignReason: row.reassignReason ?? null,
    closedAt: normalizeNullableDate(row.closedAt),
    closedByName: row.closedByName ?? null,
    closeReason: row.closeReason ?? null,
  };
}
