import { and, claims, eq, sql } from '@interdomestik/database';
import type { SQLWrapper } from 'drizzle-orm';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { canTransition } from './transition-guard';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import {
  buildTransitionClaimWhere,
  loadTransitionReadContext,
  type LockedTransitionInputs,
} from './transition-read-context';
import { transitionCurrentStateCas } from './transition-current-state-cas';
import { isValidTransitionCurrentState } from './transition-current-state';
import {
  ClaimTransitionAuthorizationError,
  ClaimTransitionConflictError,
  recordTransitionSideEffects,
  type AuthorizeClaimTransitionResult,
  type PersistAuthorizedTransitionArgs,
  type TransitionClaimStatusParams,
  type TransitionClaimStatusResult,
  type TransitionTx,
  type WrittenTransitionStatus,
} from './transition-side-effects';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export * from './transition-side-effects';

// The CAS status write of an authorized transition. Callers record its side effects next, in the
// same transaction, through recordAuthorizedTransitionSideEffects.
export async function writeAuthorizedTransitionStatus(
  tx: TransitionTx,
  args: Omit<PersistAuthorizedTransitionArgs, 'readWhere'>,
  readWhere: SQLWrapper,
  now = new Date()
): Promise<WrittenTransitionStatus> {
  const { actor, authorization, claimId, current } = args;

  if (authorization.from !== current.status || authorization.actorId !== actor.id) {
    throw new ClaimTransitionAuthorizationError(claimId);
  }
  const toStatus = authorization.to;

  const updateData =
    current.status === toStatus
      ? { updatedAt: now }
      : {
          ...mapClaimStatusToLifecycleStates(toStatus),
          lifecycleVersion: sql`${claims.lifecycleVersion} + 1`,
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
  return { lifecycleVersion: updated[0].lifecycleVersion, now, toStatus };
}

// Stage history and domain events of a written transition, with the note the caller resolved.
export async function recordAuthorizedTransitionSideEffects(
  tx: TransitionTx,
  args: Omit<PersistAuthorizedTransitionArgs, 'readWhere'>,
  written: WrittenTransitionStatus,
  note: string | null
): Promise<void> {
  await recordTransitionSideEffects(tx, {
    actor: args.actor,
    claimId: args.claimId,
    correlationId: args.correlationId,
    evidenceCount: args.authorization.evidenceCount,
    evidenceIds: args.authorization.evidenceIds,
    fromStatus: args.current.status,
    hostId: args.hostId,
    isPublic: args.isPublic,
    lifecycleVersion: written.lifecycleVersion,
    note,
    now: written.now,
    tenantId: args.tenantId,
    toStatus: written.toStatus,
  });
}

// T-002d: claim-status persistence requires proof from canTransition().
export async function persistAuthorizedTransition(
  tx: TransitionTx,
  args: PersistAuthorizedTransitionArgs
): Promise<{ lifecycleVersion: number }> {
  const written = await writeAuthorizedTransitionStatus(tx, args, args.readWhere);
  await recordAuthorizedTransitionSideEffects(tx, args, written, args.note);
  return { lifecycleVersion: written.lifecycleVersion };
}

// Reads the claim under the caller's scope and decides the transition. A caller that must write
// before the status (in the same transaction) runs that write after this succeeds and before
// writeAuthorizedTransitionStatus.
export async function authorizeClaimTransitionInTransaction(
  tx: TransitionTx,
  params: TransitionClaimStatusParams,
  locked?: LockedTransitionInputs
): Promise<AuthorizeClaimTransitionResult> {
  const {
    actor,
    claimId,
    correlationId,
    isPublic = true,
    note,
    requiredWhereCondition,
    tenantId,
    toStatus,
  } = params;
  const { current, guardContext } = await loadTransitionReadContext(
    tx,
    buildTransitionClaimWhere({ claimId, requiredWhereCondition, tenantId }),
    { claimId, tenantId, toStatus },
    locked
  );

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
  if (!decision.allowed) {
    return { success: false, error: 'transition_rejected', reason: decision.reason };
  }

  return {
    success: true,
    transition: {
      actor,
      authorization: decision.authorization,
      claimId,
      correlationId,
      current,
      hostId: params.hostId,
      isPublic,
      note: note ?? null,
      tenantId,
    },
  };
}

export async function transitionClaimStatusInTransaction(
  tx: TransitionTx,
  params: TransitionClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  const authorized = await authorizeClaimTransitionInTransaction(tx, params);
  if (!authorized.success) return { success: false, error: authorized.error };
  const { transition } = authorized;
  const { lifecycleVersion } = await persistAuthorizedTransition(tx, {
    ...transition,
    readWhere: buildTransitionClaimWhere(params),
  });
  return {
    success: true,
    fromStatus: transition.current.status,
    lifecycleVersion,
    status: transition.authorization.to,
  };
}

export async function transitionClaimStatus(
  params: Omit<TransitionClaimStatusParams, 'tenantId'> & { authority: TenantAuthority }
): Promise<TransitionClaimStatusResult> {
  const { authority, ...transitionParams } = params;
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transition by values and where clause
  return withTenantAuthority(authority, tx =>
    transitionClaimStatusInTransaction(tx, { ...transitionParams, tenantId })
  );
}
