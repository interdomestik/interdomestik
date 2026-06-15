import { appendEvent, type DomainEventTx } from '@interdomestik/database';

import type { NewMembershipOwnershipSource } from './new-membership-ownership';

export async function recordMembershipAttributionRecordedEvent(params: {
  memberId: string;
  now: Date;
  ownershipSource: NewMembershipOwnershipSource;
  tenantId: string;
  tx: DomainEventTx;
}) {
  await appendEvent(params.tx, {
    actor: { id: 'paddle-webhook', role: 'system' },
    aggregateVersion: 0,
    correlationId: `membership:${params.memberId}:agent-attribution-recorded`,
    createdAt: params.now,
    entity: { id: params.memberId, type: 'member' },
    eventName: 'membership.agent_attribution_recorded',
    eventVersion: 1,
    payload: {
      ownershipSource: params.ownershipSource,
      readScopeGranted: false,
    },
    tenantId: params.tenantId,
  });
}
