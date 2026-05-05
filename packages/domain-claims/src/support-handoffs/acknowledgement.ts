import { and, db, eq, sql, supportHandoffs } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { inArray, isNotNull } from 'drizzle-orm';

import type {
  AcknowledgeSupportHandoffPublicResponseErrorCode,
  AcknowledgeSupportHandoffPublicResponseInput,
  AcknowledgeSupportHandoffPublicResponseResult,
  SupportHandoffActionResult,
  SupportHandoffDeps,
  SupportHandoffSession,
} from './types';
import { ACTIVE_HANDOFF_STATUSES } from './types';

const STALE_RESPONSE_ERROR =
  'The support team updated this response. Please review the latest update.';
const ACKNOWLEDGEMENT_UNAVAILABLE_ERROR = 'Unable to acknowledge this response.';

function normalizeNullableDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function failure(
  error: string,
  code: AcknowledgeSupportHandoffPublicResponseErrorCode
): SupportHandoffActionResult<AcknowledgeSupportHandoffPublicResponseResult> {
  return { success: false, error, code };
}

function requireMemberSession(session: SupportHandoffSession | null) {
  if (session?.user?.role !== 'member' && session?.user?.role !== 'user') {
    return null;
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return null;
  }

  return { tenantId, user: session.user };
}

function isCurrentResponseAcknowledged(args: {
  acknowledgedAt: Date | string | null;
  acknowledgedById: string | null;
  acknowledgedVersion: number | null;
  memberId: string;
  publicResponseVersion: number;
}) {
  return (
    args.acknowledgedById === args.memberId &&
    args.acknowledgedVersion === args.publicResponseVersion &&
    normalizeNullableDate(args.acknowledgedAt) != null
  );
}

export async function acknowledgeSupportHandoffPublicResponseCore(
  params: AcknowledgeSupportHandoffPublicResponseInput & {
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<AcknowledgeSupportHandoffPublicResponseResult>> {
  const memberSession = requireMemberSession(params.session);
  if (!memberSession) {
    return failure('Unauthorized', 'UNAUTHORIZED');
  }

  const memberId = memberSession.user.id;
  const expectedVersion = Number.isFinite(params.expectedPublicResponseVersion)
    ? params.expectedPublicResponseVersion
    : -1;
  const now = new Date();

  const updated = await db
    .update(supportHandoffs)
    .set({
      publicResponseAcknowledgedAt: now,
      publicResponseAcknowledgedById: memberId,
      publicResponseAcknowledgedVersion: expectedVersion,
      updatedAt: now,
    })
    .where(
      withTenant(
        memberSession.tenantId,
        supportHandoffs.tenantId,
        and(
          eq(supportHandoffs.id, params.handoffId),
          eq(supportHandoffs.memberId, memberId),
          inArray(supportHandoffs.status, ACTIVE_HANDOFF_STATUSES),
          isNotNull(supportHandoffs.publicResponse),
          eq(supportHandoffs.publicResponseVersion, expectedVersion),
          sql`(${supportHandoffs.publicResponseAcknowledgedVersion} is distinct from ${expectedVersion} or ${supportHandoffs.publicResponseAcknowledgedById} is distinct from ${memberId} or ${supportHandoffs.publicResponseAcknowledgedAt} is null)`
        )
      )
    )
    .returning({
      acknowledgedAt: supportHandoffs.publicResponseAcknowledgedAt,
      handoffId: supportHandoffs.id,
      publicResponseAcknowledgedVersion: supportHandoffs.publicResponseAcknowledgedVersion,
    });

  const row = updated[0];
  if (row) {
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: memberId,
        actorRole: memberSession.user.role,
        tenantId: memberSession.tenantId,
        action: 'support_handoff.public_response_acknowledged',
        entityType: 'support_handoff',
        entityId: params.handoffId,
        metadata: {
          publicResponseVersion: expectedVersion,
        },
        headers: params.requestHeaders,
      });
    }

    return {
      success: true,
      data: {
        acknowledgedAt: normalizeNullableDate(row.acknowledgedAt) ?? now.toISOString(),
        handoffId: row.handoffId,
        publicResponseAcknowledgedVersion: row.publicResponseAcknowledgedVersion ?? expectedVersion,
      },
    };
  }

  const existing = await db
    .select({
      acknowledgedAt: supportHandoffs.publicResponseAcknowledgedAt,
      acknowledgedById: supportHandoffs.publicResponseAcknowledgedById,
      acknowledgedVersion: supportHandoffs.publicResponseAcknowledgedVersion,
      publicResponse: supportHandoffs.publicResponse,
      publicResponseVersion: supportHandoffs.publicResponseVersion,
      status: supportHandoffs.status,
    })
    .from(supportHandoffs)
    .where(
      withTenant(
        memberSession.tenantId,
        supportHandoffs.tenantId,
        and(eq(supportHandoffs.id, params.handoffId), eq(supportHandoffs.memberId, memberId))
      )
    )
    .limit(1);

  const current = existing[0];
  if (!current) {
    return failure(ACKNOWLEDGEMENT_UNAVAILABLE_ERROR, 'UNAUTHORIZED');
  }

  if (
    !ACTIVE_HANDOFF_STATUSES.includes(current.status as (typeof ACTIVE_HANDOFF_STATUSES)[number])
  ) {
    return failure('This support request is closed.', 'CLOSED');
  }

  if (!current.publicResponse) {
    return failure(ACKNOWLEDGEMENT_UNAVAILABLE_ERROR, 'UNAUTHORIZED');
  }

  if (current.publicResponseVersion !== expectedVersion) {
    return failure(STALE_RESPONSE_ERROR, 'STALE_VERSION');
  }

  if (
    isCurrentResponseAcknowledged({
      acknowledgedAt: current.acknowledgedAt,
      acknowledgedById: current.acknowledgedById,
      acknowledgedVersion: current.acknowledgedVersion,
      memberId,
      publicResponseVersion: expectedVersion,
    })
  ) {
    return {
      success: true,
      data: {
        acknowledgedAt: normalizeNullableDate(current.acknowledgedAt) ?? now.toISOString(),
        handoffId: params.handoffId,
        publicResponseAcknowledgedVersion: expectedVersion,
      },
    };
  }

  return failure(STALE_RESPONSE_ERROR, 'STALE_VERSION');
}
