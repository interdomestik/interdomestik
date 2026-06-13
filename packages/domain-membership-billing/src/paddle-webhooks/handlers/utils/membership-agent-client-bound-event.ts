import { appendEvent, type DomainEventTx } from '@interdomestik/database';

import type { NewMembershipOwnershipSource } from './new-membership-ownership';

export async function recordMembershipAgentClientBoundEvent(params: {
  memberId: string;
  now: Date;
  ownershipSource: NewMembershipOwnershipSource;
  tenantId: string;
  tx: DomainEventTx;
}) {
  await appendEvent(params.tx, {
    actor: { id: 'paddle-webhook', role: 'system' },
    aggregateVersion: 0,
    correlationId: `membership:${params.memberId}:agent-client-bound`,
    createdAt: params.now,
    entity: { id: params.memberId, type: 'member' },
    eventName: 'membership.agent_client_bound',
    eventVersion: 1,
    payload: {
      bindingStatus: 'active',
      ownershipSource: params.ownershipSource,
    },
    tenantId: params.tenantId,
  });
}
