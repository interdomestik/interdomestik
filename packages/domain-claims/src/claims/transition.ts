import { and, appendEvent, claimStageHistory, claims, db, eq, sql } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { SQLWrapper } from 'drizzle-orm';
import { canTransition, isClaimStatus, type ClaimTransitionActor } from './transition-guard';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import type { PaymentAuthorizationState } from '../staff-claims/types';

export type TransitionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ClaimTransitionConflictError extends Error {
  constructor(claimId: string) {
    super(`Claim ${claimId} changed before the status transition could be saved.`);
    this.name = 'ClaimTransitionConflictError';
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

export async function transitionClaimStatusInTransaction(
  tx: TransitionTx,
  params: TransitionClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  const {
    actor,
    claimId,
    correlationId,
    isPublic = true,
    note,
    paymentAuthorizationState,
    requiredWhereCondition,
    staffRecoveryPrerequisitesSatisfied,
    tenantId,
    toStatus,
  } = params;
  const scopedWhere = withTenant(tenantId, claims.tenantId, eq(claims.id, claimId));
  const readWhere = requiredWhereCondition ? and(scopedWhere, requiredWhereCondition) : scopedWhere;

  // db-access-guard: tenant-scoped -- reason: tenantId is an explicit command parameter.
  const [current] = await tx
    .select({
      id: claims.id,
      lifecycleVersion: claims.lifecycleVersion,
      status: claims.status,
    })
    .from(claims)
    .where(readWhere)
    .limit(1);

  if (!current) return { success: false, error: 'claim_not_found' };
  if (!isClaimStatus(current.status)) return { success: false, error: 'invalid_current_status' };

  const decision = canTransition({
    actor,
    context: { paymentAuthorizationState, staffRecoveryPrerequisitesSatisfied },
    from: current.status,
    to: toStatus,
  });
  if (!decision.allowed) return { success: false, error: 'transition_rejected' };

  const now = new Date();
  let lifecycleVersion = current.lifecycleVersion;
  const updateData =
    current.status === toStatus
      ? { updatedAt: now }
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
        eq(claims.status, current.status),
        eq(claims.lifecycleVersion, current.lifecycleVersion)
      )
    )
    .returning({ id: claims.id, lifecycleVersion: claims.lifecycleVersion });

  if (updated.length === 0) throw new ClaimTransitionConflictError(claimId);
  lifecycleVersion = updated[0].lifecycleVersion;

  // db-access-guard: tenant-scoped -- reason: tenantId is copied from the command boundary.
  await tx.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    tenantId,
    claimId,
    fromStatus: current.status,
    toStatus,
    changedById: actor.id,
    changedByRole: actor.role,
    note: note ?? null,
    isPublic,
    createdAt: now,
  });

  if (current.status !== toStatus) {
    await appendEvent(tx, {
      actor: { id: actor.id, role: actor.role?.trim() || 'unknown' },
      aggregateVersion: lifecycleVersion,
      correlationId: correlationId ?? crypto.randomUUID(),
      createdAt: now,
      entity: { id: claimId, type: 'claim' },
      eventName: 'claim.status_changed',
      eventVersion: 1,
      payload: {
        fromStatus: current.status,
        toStatus,
      },
      tenantId,
    });
  }

  return { success: true, fromStatus: current.status, lifecycleVersion, status: toStatus };
}

export async function transitionClaimStatus(
  params: TransitionClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transition by values and where clause
  return db.transaction(tx => transitionClaimStatusInTransaction(tx, params));
}
