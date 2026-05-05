import { and, db, eq, sql, supportHandoffs } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { inArray, isNotNull } from 'drizzle-orm';

import {
  isCurrentResponseAcknowledged,
  normalizeNullableDate,
  requireSupportHandoffMemberSession,
} from './member-response-state';
import type {
  SubmitSupportHandoffMemberReplyErrorCode,
  SubmitSupportHandoffMemberReplyInput,
  SubmitSupportHandoffMemberReplyResult,
  SupportHandoffActionResult,
  SupportHandoffDeps,
  SupportHandoffSession,
} from './types';
import { ACTIVE_HANDOFF_STATUSES, MAX_MEMBER_REPLY_LENGTH } from './types';

const STALE_RESPONSE_ERROR =
  'The support team updated this response. Please review the latest update.';
const REPLY_UNAVAILABLE_ERROR = 'Unable to reply to this response.';
const NOT_ACKNOWLEDGED_ERROR = 'Please acknowledge this response before replying.';
const ALREADY_REPLIED_ERROR = 'You already replied to this response.';

function failure(
  error: string,
  code: SubmitSupportHandoffMemberReplyErrorCode
): SupportHandoffActionResult<SubmitSupportHandoffMemberReplyResult> {
  return { success: false, error, code };
}

function normalizeReplyText(value: string | null | undefined) {
  return value?.trim().slice(0, MAX_MEMBER_REPLY_LENGTH) ?? '';
}

export async function submitSupportHandoffMemberReplyCore(
  params: SubmitSupportHandoffMemberReplyInput & {
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<SubmitSupportHandoffMemberReplyResult>> {
  const memberSession = requireSupportHandoffMemberSession(params.session);
  if (!memberSession) {
    return failure('Unauthorized', 'UNAUTHORIZED');
  }

  const memberId = memberSession.user.id;
  const expectedVersion = Number.isFinite(params.expectedPublicResponseVersion)
    ? params.expectedPublicResponseVersion
    : -1;
  const memberReply = normalizeReplyText(params.replyText);
  if (expectedVersion <= 0) {
    return failure(REPLY_UNAVAILABLE_ERROR, 'NO_RESPONSE');
  }

  if (!memberReply) {
    return failure(REPLY_UNAVAILABLE_ERROR, 'UNAUTHORIZED');
  }

  const now = new Date();
  const updated = await db
    .update(supportHandoffs)
    .set({
      memberReply,
      memberReplyAt: now,
      memberReplyResponseVersion: expectedVersion,
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
          eq(supportHandoffs.publicResponseAcknowledgedById, memberId),
          eq(supportHandoffs.publicResponseAcknowledgedVersion, expectedVersion),
          isNotNull(supportHandoffs.publicResponseAcknowledgedAt),
          sql`${supportHandoffs.memberReplyResponseVersion} is distinct from ${expectedVersion}`
        )
      )
    )
    .returning({
      handoffId: supportHandoffs.id,
      memberReplyAt: supportHandoffs.memberReplyAt,
      memberReplyResponseVersion: supportHandoffs.memberReplyResponseVersion,
    });

  const row = updated[0];
  if (row) {
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: memberId,
        actorRole: memberSession.user.role,
        tenantId: memberSession.tenantId,
        action: 'support_handoff.member_reply_submitted',
        entityType: 'support_handoff',
        entityId: params.handoffId,
        metadata: {
          handoffId: params.handoffId,
          tenantId: memberSession.tenantId,
          memberId,
          replyResponseVersion: expectedVersion,
          replyAt: normalizeNullableDate(row.memberReplyAt) ?? now.toISOString(),
        },
        headers: params.requestHeaders,
      });
    }

    return {
      success: true,
      data: {
        handoffId: row.handoffId,
        memberReplyAt: normalizeNullableDate(row.memberReplyAt) ?? now.toISOString(),
        memberReplyResponseVersion: row.memberReplyResponseVersion ?? expectedVersion,
      },
    };
  }

  const existing = await db
    .select({
      acknowledgedAt: supportHandoffs.publicResponseAcknowledgedAt,
      acknowledgedById: supportHandoffs.publicResponseAcknowledgedById,
      acknowledgedVersion: supportHandoffs.publicResponseAcknowledgedVersion,
      memberReplyResponseVersion: supportHandoffs.memberReplyResponseVersion,
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
    return failure(REPLY_UNAVAILABLE_ERROR, 'UNAUTHORIZED');
  }

  if (
    !ACTIVE_HANDOFF_STATUSES.includes(current.status as (typeof ACTIVE_HANDOFF_STATUSES)[number])
  ) {
    return failure('This support request is closed.', 'CLOSED');
  }

  if (!current.publicResponse || (current.publicResponseVersion ?? 0) <= 0) {
    return failure(REPLY_UNAVAILABLE_ERROR, 'NO_RESPONSE');
  }

  if (current.publicResponseVersion !== expectedVersion) {
    return failure(STALE_RESPONSE_ERROR, 'STALE_VERSION');
  }

  if (current.memberReplyResponseVersion === expectedVersion) {
    return failure(ALREADY_REPLIED_ERROR, 'ALREADY_REPLIED');
  }

  if (
    !isCurrentResponseAcknowledged({
      acknowledgedAt: current.acknowledgedAt,
      acknowledgedById: current.acknowledgedById,
      acknowledgedVersion: current.acknowledgedVersion,
      memberId,
      publicResponseVersion: expectedVersion,
    })
  ) {
    return failure(NOT_ACKNOWLEDGED_ERROR, 'NOT_ACKNOWLEDGED');
  }

  return failure(STALE_RESPONSE_ERROR, 'STALE_VERSION');
}
