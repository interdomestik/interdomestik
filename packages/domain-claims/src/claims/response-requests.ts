import {
  and,
  claimResponseRequests,
  eq,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type ClaimSubject = { tenantId: string; claimId: string };

type Request = ClaimSubject &
  ({ kind: 'claim_submitted' } | { kind: 'member_message'; messageId: string });

type Answer = ClaimSubject & { actorId: string } & (
    { kind: 'status_change' } | { kind: 'public_message'; messageId: string }
  );

/** The caller holds the claim write lock or inserted the claim in this transaction. */
export async function createClaimResponseRequest(tx: TenantTransaction, request: Request) {
  // db-access-guard: tenant-scoped -- reason: tenant of the caller's locked or newly inserted claim.
  await tx.insert(claimResponseRequests).values({
    id: nanoid(),
    tenantId: request.tenantId,
    claimId: request.claimId,
    kind: request.kind,
    sourceMessageId: request.kind === 'member_message' ? request.messageId : null,
    requestedAt: sql`clock_timestamp()`,
  });
}

/** The caller holds the claim write lock and has stored the new public answer. */
export async function answerClaimResponseRequests(tx: TenantTransaction, answer: Answer) {
  const isStatusChange = answer.kind === 'status_change';
  // db-access-guard: tenant-scoped -- reason: tenant of the caller's locked claim.
  await tx
    .update(claimResponseRequests)
    .set({
      answeredAt: sql`(select clock_timestamp())`,
      answeredBy: answer.actorId,
      answerKind: isStatusChange ? 'member_visible_status_change' : 'public_staff_message',
      answerMessageId: isStatusChange ? null : answer.messageId,
    })
    .where(
      withTenant(
        answer.tenantId,
        claimResponseRequests.tenantId,
        and(
          eq(claimResponseRequests.claimId, answer.claimId),
          isNull(claimResponseRequests.answeredAt),
          isStatusChange ? eq(claimResponseRequests.kind, 'claim_submitted') : undefined
        )
      )
    );
}
