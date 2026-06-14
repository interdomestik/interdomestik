import { appendEvent, type DomainEventTx } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';

export async function recordCaseCreatedEvent(
  tx: DomainEventTx,
  params: {
    actor: { id: string; role: string };
    claimId: string;
    createdAt: Date;
    hasDocuments: boolean;
    initialStatus: ClaimStatus;
    tenantId: string;
  }
): Promise<void> {
  await appendEvent(tx, {
    actor: { id: params.actor.id, role: params.actor.role.trim() || 'member' },
    aggregateVersion: 1,
    correlationId: crypto.randomUUID(),
    createdAt: params.createdAt,
    entity: { id: params.claimId, type: 'case' },
    eventName: 'case.created',
    eventVersion: 1,
    payload: {
      hasDocuments: params.hasDocuments,
      initialStatus: params.initialStatus,
    },
    tenantId: params.tenantId,
  });
}
