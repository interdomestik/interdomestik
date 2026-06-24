import { claimStageHistory, db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';
import type { AuthorizedTransition, ClaimTransitionActor } from './transition-guard';
import type { TransitionCurrentState } from './transition-current-state';
import { recordCaseCreatedEvent } from './case-created-event';
import { recordTransitionDomainEvents } from './transition-domain-events';
import type { CreateClaimValues } from '../validators/claims';
export type TransitionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type AuthorizedTransitionHookTx = Pick<TransitionTx, 'insert' | 'select' | 'update'>;
export function authorizedTransitionHookTx(tx: TransitionTx): AuthorizedTransitionHookTx {
  return {
    insert: tx.insert.bind(tx),
    select: tx.select.bind(tx),
    update: tx.update.bind(tx),
  };
}
export type TransitionSideEffectsArgs = {
  actor: ClaimTransitionActor;
  claimId: string;
  correlationId?: string;
  fromStatus: ClaimStatus;
  hostId?: string | null;
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
  hostId?: string | null;
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
  beforePersistAuthorized?: (tx: AuthorizedTransitionHookTx) => Promise<void>;
  claimId: string;
  correlationId?: string;
  hostId?: string | null;
  isPublic?: boolean;
  note?: string | null;
  requiredWhereCondition?: SQLWrapper;
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
  hostId?: string | null;
  current: TransitionCurrentState;
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
    hostId: args.hostId,
    initialStatus: 'submitted',
    tenantId: args.tenantId,
  });
}
// T-002d side effects must stay in the same transaction as the status write.
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
  await recordTransitionDomainEvents({
    actor,
    claimId,
    correlationId,
    fromStatus,
    hostId: args.hostId,
    lifecycleVersion,
    now,
    tenantId,
    toStatus,
    tx,
  });
}
