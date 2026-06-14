import { appendEvent, type DomainEventTx } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';

import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import type { ClaimTransitionActor } from './transition-guard';

type TransitionEventArgs = {
  actor: ClaimTransitionActor;
  claimId: string;
  correlationId?: string;
  fromStatus: ClaimStatus;
  lifecycleVersion: number;
  now: Date;
  tenantId: string;
  toStatus: ClaimStatus;
  tx: DomainEventTx;
};

async function appendTransitionEvent(
  args: TransitionEventArgs & {
    entityType: 'case' | 'claim' | 'recovery';
    eventName: string;
    payload: Record<string, unknown>;
  }
) {
  await appendEvent(args.tx, {
    actor: { id: args.actor.id, role: args.actor.role?.trim() || 'unknown' },
    aggregateVersion: args.lifecycleVersion,
    correlationId: args.correlationId ?? crypto.randomUUID(),
    createdAt: args.now,
    entity: { id: args.claimId, type: args.entityType },
    eventName: args.eventName,
    eventVersion: 1,
    payload: args.payload,
    tenantId: args.tenantId,
  });
}

export async function recordTransitionDomainEvents(args: TransitionEventArgs): Promise<void> {
  if (args.fromStatus === args.toStatus) return;

  const correlationId = args.correlationId ?? crypto.randomUUID();
  const fromLifecycle = mapClaimStatusToLifecycleStates(args.fromStatus);
  const toLifecycle = mapClaimStatusToLifecycleStates(args.toStatus);
  const statusPayload = { fromStatus: args.fromStatus, toStatus: args.toStatus };

  await appendTransitionEvent({
    ...args,
    correlationId,
    entityType: 'claim',
    eventName: 'claim.status_changed',
    payload: statusPayload,
  });

  if (fromLifecycle.caseLifecycleState !== toLifecycle.caseLifecycleState) {
    await appendTransitionEvent({
      ...args,
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
    await appendTransitionEvent({
      ...args,
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
