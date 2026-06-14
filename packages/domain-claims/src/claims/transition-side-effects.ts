import { appendEvent, claimStageHistory, db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';
import type { AuthorizedTransition, ClaimTransitionActor } from './transition-guard';
import { recordCaseCreatedEvent } from './case-created-event';
import type { CreateClaimValues } from '../validators/claims';
import type { PaymentAuthorizationState } from '../staff-claims/types';

export type TransitionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TransitionSideEffectsArgs = {
  actor: ClaimTransitionActor;
  claimId: string;
  correlationId?: string;
  fromStatus: ClaimStatus;
  isPublic: boolean;
  lifecycleVersion: number;
  note: string | null;
  now: Date;
  tenantId: string;
  toStatus: ClaimStatus;
};
export type RecordSubmittedClaimLifecycleArgs = {
  changedByRole: string;
  claimId: string;
  createdAt: Date;
  data: Pick<CreateClaimValues, 'files'>;
  publicNote: string | null;
  tenantId: string;
  userId: string;
};
export class ClaimTransitionConflictError extends Error {
  constructor(claimId: string) {
    super(`Claim ${claimId} changed before the status transition could be saved.`);
    this.name = 'ClaimTransitionConflictError';
  }
}
export class ClaimTransitionAuthorizationError extends Error {
  constructor(claimId: string) {
    super(`Claim ${claimId} status write attempted with a mismatched authorization proof.`);
    this.name = 'ClaimTransitionAuthorizationError';
  }
}
export type TransitionClaimStatusParams = {
  actor: ClaimTransitionActor;
  claimId: string;
  correlationId?: string;
  isPublic?: boolean;
  note?: string | null;
  paymentAuthorizationState?: PaymentAuthorizationState | null;
  requiredWhereCondition?: SQLWrapper;
  staffRecoveryPrerequisitesSatisfied?: boolean;
  tenantId: string;
  toStatus: ClaimStatus;
};
export type TransitionClaimStatusResult =
  | { success: true; fromStatus: ClaimStatus; lifecycleVersion: number; status: ClaimStatus }
  | { success: false; error: 'claim_not_found' | 'invalid_current_status' | 'transition_rejected' };
export type PersistAuthorizedTransitionArgs = {
  actor: ClaimTransitionActor;
  authorization: AuthorizedTransition;
  claimId: string;
  correlationId?: string;
  current: { lifecycleVersion: number; status: ClaimStatus };
  isPublic: boolean;
  note: string | null;
  readWhere: SQLWrapper;
  tenantId: string;
};
export async function recordSubmittedClaimLifecycle(
  tx: TransitionTx,
  args: RecordSubmittedClaimLifecycleArgs
): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: tenant proof is copied from the claim command boundary.
  await tx.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    tenantId: args.tenantId,
    claimId: args.claimId,
    fromStatus: null,
    toStatus: 'submitted',
    changedById: args.userId,
    changedByRole: args.changedByRole,
    note: args.publicNote,
    isPublic: true,
    createdAt: args.createdAt,
  });
  await recordCaseCreatedEvent(tx, {
    actor: { id: args.userId, role: args.changedByRole.trim() || 'member' },
    claimId: args.claimId,
    createdAt: args.createdAt,
    hasDocuments: Boolean(args.data.files?.length),
    initialStatus: 'submitted',
    tenantId: args.tenantId,
  });
}
// T-002d Boy Scout split from transition.ts: stage-history + outbox side
// effects for an authorized status transition. Must always run inside the
// SAME Postgres transaction as the status write; this module does not write claims.status.
export async function recordTransitionSideEffects(
  tx: TransitionTx,
  args: TransitionSideEffectsArgs
): Promise<void> {
  const {
    actor,
    claimId,
    correlationId,
    fromStatus,
    isPublic,
    lifecycleVersion,
    note,
    now,
    tenantId,
    toStatus,
  } = args;

  // db-access-guard: tenant-scoped -- reason: tenantId is copied from the command boundary.
  await tx.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    tenantId,
    claimId,
    fromStatus,
    toStatus,
    changedById: actor.id,
    changedByRole: actor.role,
    note,
    isPublic,
    createdAt: now,
  });
  if (fromStatus !== toStatus) {
    await appendEvent(tx, {
      actor: { id: actor.id, role: actor.role?.trim() || 'unknown' },
      aggregateVersion: lifecycleVersion,
      correlationId: correlationId ?? crypto.randomUUID(),
      createdAt: now,
      entity: { id: claimId, type: 'claim' },
      eventName: 'claim.status_changed',
      eventVersion: 1,
      payload: {
        fromStatus,
        toStatus,
      },
      tenantId,
    });
  }
}
