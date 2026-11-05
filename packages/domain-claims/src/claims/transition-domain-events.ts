import { appendEvent, type DomainEventTx } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';

import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import type { ClaimTransitionActor } from './transition-guard';

type TransitionEventArgs = {
  actor: ClaimTransitionActor;
  claimId: string;
  correlationId?: string;
  evidenceCount: number;
  evidenceIds: readonly string[];
  fromStatus: ClaimStatus;
  hostId?: string | null;
  lifecycleVersion: number;
  now: Date;
  tenantId: string;
  toStatus: ClaimStatus;
  tx: DomainEventTx;
};

async function appendTransitionEvent(
  tx: DomainEventTx,
  args: Omit<TransitionEventArgs, 'tx'> & {
    entityType: 'case' | 'claim' | 'recovery';
    eventName: string;
    payload: Record<string, unknown>;
  }
) {
  await appendEvent(tx, {
    actor: { id: args.actor.id, role: args.actor.role?.trim() || 'unknown' },
    aggregateVersion: args.lifecycleVersion,
    correlationId: args.correlationId ?? crypto.randomUUID(),
    createdAt: args.now,
    entity: { id: args.claimId, type: args.entityType },
    eventName: args.eventName,
    eventVersion: 1,
    hostId: args.hostId,
    payload: args.payload,
    tenantId: args.tenantId,
  });
}

export async function recordTransitionDomainEvents(args: TransitionEventArgs): Promise<void> {
  if (args.fromStatus === args.toStatus) return;
  // The transaction is passed on its own so the event fields can be spread without carrying it.
  const { tx, ...event } = args;

  const correlationId = args.correlationId ?? crypto.randomUUID();
  const fromLifecycle = mapClaimStatusToLifecycleStates(args.fromStatus);
  const toLifecycle = mapClaimStatusToLifecycleStates(args.toStatus);
  const statusPayload = {
    evidenceCount: args.evidenceCount,
    evidenceIds: [...args.evidenceIds],
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
  };

  await appendTransitionEvent(tx, {
    ...event,
    correlationId,
    entityType: 'claim',
    eventName: 'claim.status_changed',
    payload: statusPayload,
  });

  if (fromLifecycle.caseLifecycleState !== toLifecycle.caseLifecycleState) {
    await appendTransitionEvent(tx, {
      ...event,
      correlationId,
      entityType: 'case',
      eventName: 'case.lifecycle_changed',
      payload: {
        ...statusPayload,
        fromState: fromLifecycle.caseLifecycleState,
        toState: toLifecycle.caseLifecycleState,
      },
    });
  }

  if (fromLifecycle.recoveryLifecycleState !== toLifecycle.recoveryLifecycleState) {
    await appendTransitionEvent(tx, {
      ...event,
      correlationId,
      entityType: 'recovery',
      eventName: 'recovery.lifecycle_changed',
      payload: {
        ...statusPayload,
        fromState: fromLifecycle.recoveryLifecycleState,
        toState: toLifecycle.recoveryLifecycleState,
      },
    });
  }
}
