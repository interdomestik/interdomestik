import { and, db, desc, eq, sql, supportHandoffs } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { inArray, isNotNull, type SQL } from 'drizzle-orm';

import type {
  MemberSupportHandoffPublicResponse,
  SupportHandoffActionResult,
  SupportHandoffDeps,
  SupportHandoffSession,
  UpdateSupportHandoffPublicResponseInput,
  UpdateSupportHandoffPublicResponseResult,
} from './types';
import { ACTIVE_HANDOFF_STATUSES, MAX_PUBLIC_RESPONSE_LENGTH } from './types';

type StaffUser = SupportHandoffSession['user'] & { branchId?: string | null };

function normalizePublicResponse(value: string | null | undefined) {
  return value?.trim().slice(0, MAX_PUBLIC_RESPONSE_LENGTH) ?? '';
}

function normalizeNullableDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function requireStaffSession(session: SupportHandoffSession | null) {
  if (session?.user?.role !== 'staff') {
    return null;
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return null;
  }

  const user = session.user as StaffUser;
  if (!user.branchId) {
    return null;
  }

  return { tenantId, user };
}

function buildBranchScope(branchId: string | null | undefined) {
  return branchId ? eq(supportHandoffs.branchId, branchId) : undefined;
}

export async function updateSupportHandoffPublicResponseCore(
  params: UpdateSupportHandoffPublicResponseInput & {
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<UpdateSupportHandoffPublicResponseResult>> {
  const staffSession = requireStaffSession(params.session);
  if (!staffSession) {
    return { success: false, error: 'Unauthorized' };
  }

  const publicResponse = normalizePublicResponse(params.response);
  if (!publicResponse) {
    return { success: false, error: 'Public response is required' };
  }

  const now = new Date();
  const expectedVersion = params.expectedVersion ?? 0;
  const updated = await db
    .update(supportHandoffs)
    .set({
      publicResponse,
      publicResponseAt: now,
      publicResponseById: staffSession.user.id,
      publicResponseVersion: sql`${supportHandoffs.publicResponseVersion} + 1`,
      updatedAt: now,
    })
    .where(
      withTenant(
        staffSession.tenantId,
        supportHandoffs.tenantId,
        and(
          eq(supportHandoffs.id, params.handoffId),
          eq(supportHandoffs.status, 'accepted'),
          eq(supportHandoffs.staffId, staffSession.user.id),
          eq(supportHandoffs.publicResponseVersion, expectedVersion),
          buildBranchScope(staffSession.user.branchId ?? null)
        )
      )
    )
    .returning({
      handoffId: supportHandoffs.id,
      memberId: supportHandoffs.memberId,
      publicResponseVersion: supportHandoffs.publicResponseVersion,
      tenantId: supportHandoffs.tenantId,
    });

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before response could be updated' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      tenantId: staffSession.tenantId,
      action: 'support_handoff.public_response_updated',
      entityType: 'support_handoff',
      entityId: params.handoffId,
      metadata: {
        expectedVersion,
        responseLength: publicResponse.length,
      },
      headers: params.requestHeaders,
    });
  }

  return {
    success: true,
    data: {
      handoffId: row.handoffId,
      memberId: row.memberId,
      publicResponseVersion: row.publicResponseVersion,
      tenantId: row.tenantId,
    },
  };
}

async function getLatestPublicResponseForScope(args: {
  claimId?: string | null;
  handoffId?: string | null;
  memberId: string;
  tenantId: string;
}): Promise<MemberSupportHandoffPublicResponse | null> {
  const conditions: SQL<unknown>[] = [
    eq(supportHandoffs.memberId, args.memberId),
    inArray(supportHandoffs.status, ACTIVE_HANDOFF_STATUSES),
    isNotNull(supportHandoffs.publicResponse),
  ];

  if (args.handoffId) {
    conditions.push(eq(supportHandoffs.id, args.handoffId));
  }

  if (args.claimId) {
    conditions.push(eq(supportHandoffs.claimId, args.claimId));
  }

  const rows = await db
    .select({
      handoffId: supportHandoffs.id,
      publicResponse: supportHandoffs.publicResponse,
      publicResponseAt: supportHandoffs.publicResponseAt,
      publicResponseAcknowledgedAt: supportHandoffs.publicResponseAcknowledgedAt,
      publicResponseAcknowledgedById: supportHandoffs.publicResponseAcknowledgedById,
      publicResponseAcknowledgedVersion: supportHandoffs.publicResponseAcknowledgedVersion,
      publicResponseVersion: supportHandoffs.publicResponseVersion,
    })
    .from(supportHandoffs)
    .where(withTenant(args.tenantId, supportHandoffs.tenantId, and(...conditions)))
    .orderBy(desc(supportHandoffs.publicResponseAt), desc(supportHandoffs.id))
    .limit(1);

  const row = rows[0];
  if (!row?.publicResponse) {
    return null;
  }

  return {
    handoffId: row.handoffId,
    publicResponse: row.publicResponse,
    publicResponseAt: normalizeNullableDate(row.publicResponseAt),
    publicResponseVersion: row.publicResponseVersion ?? 0,
    publicResponseAcknowledged:
      row.publicResponseAcknowledgedById === args.memberId &&
      row.publicResponseAcknowledgedVersion === (row.publicResponseVersion ?? 0),
    publicResponseAcknowledgedAt:
      row.publicResponseAcknowledgedById === args.memberId &&
      row.publicResponseAcknowledgedVersion === (row.publicResponseVersion ?? 0)
        ? normalizeNullableDate(row.publicResponseAcknowledgedAt)
        : null,
    publicResponseAcknowledgedVersion: row.publicResponseAcknowledgedVersion ?? null,
  };
}

export async function getMemberLatestPublicResponse(args: {
  claimId?: string | null;
  handoffId?: string | null;
  memberId: string;
  tenantId: string;
}): Promise<MemberSupportHandoffPublicResponse | null> {
  if (args.handoffId) {
    return getLatestPublicResponseForScope({
      handoffId: args.handoffId,
      memberId: args.memberId,
      tenantId: args.tenantId,
    });
  }

  if (args.claimId) {
    const claimResponse = await getLatestPublicResponseForScope(args);
    if (claimResponse) {
      return claimResponse;
    }
  }

  return getLatestPublicResponseForScope({
    memberId: args.memberId,
    tenantId: args.tenantId,
  });
}
