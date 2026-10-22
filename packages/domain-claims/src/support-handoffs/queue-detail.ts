import { and, eq, supportHandoffs, user, withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { aliasedTable, type SQL } from 'drizzle-orm';
import {
  buildOwnOrUnassignedStaffScope,
  normalizeContactPreference,
  normalizeNullableDate,
} from './queue-read-helpers';
import type { SupportHandoffStaffDetail } from './types';

export async function getStaffSupportHandoffDetail(params: {
  branchId?: string | null;
  handoffId: string;
  staffId: string;
  tenantId: string;
  viewerRole?: string | null;
}): Promise<SupportHandoffStaffDetail | null> {
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

  const rows = await withTenantContext({ tenantId: params.tenantId }, tx =>
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
