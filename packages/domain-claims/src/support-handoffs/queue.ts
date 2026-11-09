import {
  and,
  branches,
  claims,
  desc,
  eq,
  membershipPlans,
  inArray,
  subscriptions,
  supportHandoffs,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasSupportHandoffCurrentCycleMemberReply } from '@interdomestik/domain-crm/support-handoffs';
import { aliasedTable, type SQL } from 'drizzle-orm';
import { claimLifecycleStatusSql } from '../claims/lifecycle-read-sql';
import type {
  SupportHandoffContactPreference,
  SupportHandoffQueueAssignmentFilter,
  SupportHandoffQueueItem,
  SupportHandoffStaffDetail,
  SupportHandoffStatus,
  SupportHandoffTrustRisk,
  SupportHandoffUrgency,
} from './types';
import { buildOwnOrUnassignedStaffScope, buildStaffSupportHandoffQueueScope } from './queue-scope';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { queueMembership } from './queue-membership';

export { buildStaffSupportHandoffQueueScope } from './queue-scope';
export type { SupportHandoffClaimLinkFilter } from './queue-scope';

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

export async function getStaffSupportHandoffQueue(
  params: Omit<
    Parameters<typeof buildStaffSupportHandoffQueueScope>[0],
    'tenantId' | 'assignment' | 'status'
  > & {
    authority: TenantAuthority;
    assignment?: SupportHandoffQueueAssignmentFilter;
    status?: SupportHandoffStatus | 'all';
    limit: number;
  }
): Promise<SupportHandoffQueueItem[]> {
  const { tenantId } = readTenantAuthority(params.authority);
  const staffUser = aliasedTable(user, 'support_handoff_staff');
  const agentUser = aliasedTable(user, 'support_handoff_agent');
  return withTenantAuthority(params.authority, async tx => {
    const rows = await tx
      .select({
        handoff: supportHandoffs,
        staffName: staffUser.name,
        member: {
          id: user.id,
          name: user.name,
          email: user.email,
          memberNumber: user.memberNumber,
        },
        claim: {
          id: claims.id,
          claimNumber: claims.claimNumber,
          title: claims.title,
          status: claimLifecycleStatusSql(),
        },
        branchName: branches.name,
        agentName: agentUser.name,
      })
      .from(supportHandoffs)
      .leftJoin(user, and(eq(supportHandoffs.memberId, user.id), eq(user.tenantId, tenantId)))
      .leftJoin(
        staffUser,
        and(eq(supportHandoffs.staffId, staffUser.id), eq(staffUser.tenantId, tenantId))
      )
      .leftJoin(claims, and(eq(supportHandoffs.claimId, claims.id), eq(claims.tenantId, tenantId)))
      .leftJoin(
        branches,
        and(eq(supportHandoffs.branchId, branches.id), eq(branches.tenantId, tenantId))
      )
      .leftJoin(
        subscriptions,
        and(
          eq(supportHandoffs.memberId, subscriptions.userId),
          eq(subscriptions.tenantId, tenantId)
        )
      )
      .leftJoin(
        agentUser,
        and(eq(subscriptions.agentId, agentUser.id), eq(agentUser.tenantId, tenantId))
      )
      .where(
        buildStaffSupportHandoffQueueScope({
          ...params,
          assignment: params.assignment ?? 'all',
          attention: params.attention ?? 'all',
          claimLink: params.claimLink ?? 'all',
          status: params.status ?? 'open',
          tenantId,
          urgency: params.urgency ?? 'all',
        })
      )
      .orderBy(desc(supportHandoffs.createdAt), desc(supportHandoffs.id))
      .limit(params.limit);
    const memberIds = [...new Set(rows.flatMap(row => (row.member ? [row.member.id] : [])))];
    const memberships = await resolveEffectiveMembership(tx, tenantId, memberIds, new Date());
    const effective = new Map(
      [...memberships].map(([id, membership]) => [id, queueMembership(membership)])
    );
    const planKeys = [
      ...new Set([...effective.values()].flatMap(row => (row?.planKey ? [row.planKey] : []))),
    ];
    const plans = planKeys.length
      ? await tx
          .select({ id: membershipPlans.id, name: membershipPlans.name })
          .from(membershipPlans)
          .where(and(eq(membershipPlans.tenantId, tenantId), inArray(membershipPlans.id, planKeys)))
      : [];
    return rows.map(row => {
      const membership = effective.get(row.member?.id ?? '');
      const handoff = row.handoff;
      return {
        id: handoff.id,
        subject: handoff.subject,
        message: handoff.message,
        status: handoff.status as SupportHandoffStatus,
        urgency: handoff.urgency as SupportHandoffUrgency,
        trustRisk: handoff.trustRisk as SupportHandoffTrustRisk,
        lifecycleVersion: handoff.lifecycleVersion,
        needsFollowUp:
          handoff.status === 'accepted' &&
          hasSupportHandoffCurrentCycleMemberReply({
            memberReplyAt: normalizeNullableDate(handoff.memberReplyAt),
            memberReplyResponseVersion: handoff.memberReplyResponseVersion ?? null,
            publicResponseVersion: handoff.publicResponseVersion ?? 0,
          }),
        publicResponseAt: normalizeNullableDate(handoff.publicResponseAt),
        createdAt: normalizeNullableDate(handoff.createdAt) ?? new Date(0).toISOString(),
        updatedAt: normalizeNullableDate(handoff.updatedAt) ?? new Date(0).toISOString(),
        staffId: handoff.staffId ?? null,
        staffName: row.staffName ?? null,
        member: {
          id: row.member?.id ?? '',
          name: row.member?.name ?? '',
          email: row.member?.email ?? null,
          memberNumber: row.member?.memberNumber ?? null,
        },
        claim: row.claim?.id ? row.claim : null,
        relationship: {
          branchName: row.branchName ?? null,
          planName: plans.find(plan => plan.id === membership?.planKey)?.name ?? null,
          membershipStatus: membership?.status ?? null,
          agentName: row.agentName ?? null,
        },
      };
    });
  });
}

export async function getStaffSupportHandoffDetail(params: {
  authority: TenantAuthority;
  branchId?: string | null;
  handoffId: string;
  staffId: string;
  viewerRole?: string | null;
}): Promise<SupportHandoffStaffDetail | null> {
  const { tenantId } = readTenantAuthority(params.authority);
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

  const rows = await withTenantAuthority(params.authority, tx =>
    tx
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
        memberId: supportHandoffs.memberId,
        publicResponse: supportHandoffs.publicResponse,
        publicResponseAt: supportHandoffs.publicResponseAt,
        publicResponseAcknowledgedAt: supportHandoffs.publicResponseAcknowledgedAt,
        publicResponseAcknowledgedById: supportHandoffs.publicResponseAcknowledgedById,
        publicResponseAcknowledgedVersion: supportHandoffs.publicResponseAcknowledgedVersion,
        publicResponseVersion: supportHandoffs.publicResponseVersion,
        memberReply: supportHandoffs.memberReply,
        memberReplyAt: supportHandoffs.memberReplyAt,
        memberReplyResponseVersion: supportHandoffs.memberReplyResponseVersion,
      })
      .from(supportHandoffs)
      .leftJoin(
        acceptedByUser,
        and(
          eq(supportHandoffs.acceptedById, acceptedByUser.id),
          eq(acceptedByUser.tenantId, tenantId)
        )
      )
      .leftJoin(
        reassignedByUser,
        and(
          eq(supportHandoffs.reassignedById, reassignedByUser.id),
          eq(reassignedByUser.tenantId, tenantId)
        )
      )
      .leftJoin(
        closedByUser,
        and(eq(supportHandoffs.closedById, closedByUser.id), eq(closedByUser.tenantId, tenantId))
      )
      .where(withTenant(tenantId, supportHandoffs.tenantId, and(...conditions)))
      .limit(1)
  );

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
    publicResponse: {
      publicResponse: row.publicResponse ?? null,
      publicResponseAt: normalizeNullableDate(row.publicResponseAt),
      publicResponseVersion: row.publicResponseVersion ?? 0,
      publicResponseAcknowledged:
        row.publicResponseAcknowledgedById === row.memberId &&
        row.publicResponseAcknowledgedVersion === (row.publicResponseVersion ?? 0),
      publicResponseAcknowledgedAt:
        row.publicResponseAcknowledgedById === row.memberId &&
        row.publicResponseAcknowledgedVersion === (row.publicResponseVersion ?? 0)
          ? normalizeNullableDate(row.publicResponseAcknowledgedAt)
          : null,
      publicResponseAcknowledgedVersion: row.publicResponseAcknowledgedVersion ?? null,
    },
    memberReply: {
      memberReply: row.memberReply ?? null,
      memberReplyAt: normalizeNullableDate(row.memberReplyAt),
      memberReplyResponseVersion: row.memberReplyResponseVersion ?? null,
    },
  };
}
