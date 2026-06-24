import { and, claims, db, eq, sql } from '@interdomestik/database';
import { canTransition } from './transition-guard';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import { loadTransitionReadContext } from './transition-read-context';
import { transitionCurrentStateCas } from './transition-current-state-cas';
import { isValidTransitionCurrentState } from './transition-current-state';
import {
  ClaimTransitionAuthorizationError,
  ClaimTransitionConflictError,
  authorizedTransitionHookTx,
  recordTransitionSideEffects,
  type PersistAuthorizedTransitionArgs,
  type TransitionClaimStatusParams,
  type TransitionClaimStatusResult,
  type TransitionTx,
} from './transition-side-effects';

export * from './transition-side-effects';

// T-002d: claim-status persistence requires proof from canTransition().
export async function persistAuthorizedTransition(
  tx: TransitionTx,
  args: PersistAuthorizedTransitionArgs
): Promise<{ lifecycleVersion: number }> {
  const {
    actor,
    authorization,
    claimId,
    correlationId,
    current,
    isPublic,
    note,
    readWhere,
    tenantId,
  } = args;

  // Runtime re-check retained: the proof must match the row and actor.
  if (authorization.from !== current.status || authorization.actorId !== actor.id) {
    throw new ClaimTransitionAuthorizationError(claimId);
  }
  const toStatus = authorization.to;

  const now = new Date();
  const updateData =
    current.status === toStatus
      ? { status: toStatus, updatedAt: now }
      : {
          ...mapClaimStatusToLifecycleStates(toStatus),
          lifecycleVersion: sql`${claims.lifecycleVersion} + 1`,
          status: toStatus,
          statusUpdatedAt: now,
          updatedAt: now,
        };
  // db-access-guard: tenant-scoped -- reason: tenant scope plus lifecycle CAS are in the where clause.
  const updated = await tx
    .update(claims)
    .set(updateData)
    .where(
      and(
        readWhere,
        transitionCurrentStateCas(current),
        eq(claims.lifecycleVersion, current.lifecycleVersion)
      )
    )
    .returning({ id: claims.id, lifecycleVersion: claims.lifecycleVersion });

  if (updated.length === 0) throw new ClaimTransitionConflictError(claimId);
  const lifecycleVersion = updated[0].lifecycleVersion;

  await recordTransitionSideEffects(tx, {
    actor,
    claimId,
    correlationId,
    fromStatus: current.status,
    hostId: args.hostId,
    isPublic,
    lifecycleVersion,
    note,
    now,
    tenantId,
    toStatus,
  });

  return { lifecycleVersion };
}

export async function transitionClaimStatusInTransaction(
  tx: TransitionTx,
  params: TransitionClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  const {
    actor,
    beforePersistAuthorized,
    claimId,
    correlationId,
    isPublic = true,
    note,
    requiredWhereCondition,
    tenantId,
    toStatus,
  } = params;
  const { current, guardContext, readWhere } = await loadTransitionReadContext(tx, {
    claimId,
    requiredWhereCondition,
    tenantId,
    toStatus,
  });

  if (!current) return { success: false, error: 'claim_not_found' };
  if (!isValidTransitionCurrentState(current)) {
    return { success: false, error: 'invalid_current_status' };
  }

  const decision = canTransition({
    actor,
    context: guardContext,
    from: current.status,
    to: toStatus,
  });
  if (!decision.allowed) return { success: false, error: 'transition_rejected' };

  if (beforePersistAuthorized) {
    // Pre-CAS hooks are only for already-authorized prerequisite writes.
    // They must respect the global order: agreement, no-fee evidence, claims CAS.
    await beforePersistAuthorized(authorizedTransitionHookTx(tx));
  }

  const { lifecycleVersion } = await persistAuthorizedTransition(tx, {
    actor,
    authorization: decision.authorization,
    claimId,
    correlationId,
    current,
    hostId: params.hostId,
    isPublic,
    note: note ?? null,
    readWhere,
    tenantId,
  });

  return { success: true, fromStatus: current.status, lifecycleVersion, status: toStatus };
}

export async function transitionClaimStatus(
  params: TransitionClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transition by values and where clause
  return db.transaction(tx => transitionClaimStatusInTransaction(tx, params));
}
