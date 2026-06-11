import { appendEvent, claimStageHistory } from '@interdomestik/database';
import type { db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';
import type { AuthorizedTransition, ClaimTransitionActor } from './transition-guard';
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

// T-002d Boy Scout split from transition.ts: stage-history + outbox side
// effects for an authorized status transition. Must always run inside the
// SAME Postgres transaction as the status write (constitution invariant #2);
// this module performs no claims.status write itself.
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
