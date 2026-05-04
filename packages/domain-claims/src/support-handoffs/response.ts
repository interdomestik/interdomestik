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
): Promise<SupportHandoffActionResult<{ publicResponseVersion: number }>> {
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
    .returning({ publicResponseVersion: supportHandoffs.publicResponseVersion });

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

  return { success: true, data: { publicResponseVersion: row.publicResponseVersion } };
}

async function getLatestPublicResponseForScope(args: {
  claimId?: string | null;
  memberId: string;
  tenantId: string;
}): Promise<MemberSupportHandoffPublicResponse | null> {
  const conditions: SQL<unknown>[] = [
    eq(supportHandoffs.memberId, args.memberId),
    inArray(supportHandoffs.status, ACTIVE_HANDOFF_STATUSES),
    isNotNull(supportHandoffs.publicResponse),
  ];

  if (args.claimId) {
    conditions.push(eq(supportHandoffs.claimId, args.claimId));
  }

  const rows = await db
    .select({
      publicResponse: supportHandoffs.publicResponse,
      publicResponseAt: supportHandoffs.publicResponseAt,
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
    publicResponse: row.publicResponse,
    publicResponseAt: normalizeNullableDate(row.publicResponseAt),
  };
}

export async function getMemberLatestPublicResponse(args: {
  claimId?: string | null;
  memberId: string;
  tenantId: string;
}): Promise<MemberSupportHandoffPublicResponse | null> {
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
