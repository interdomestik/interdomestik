import { db } from '@interdomestik/database';

import { revokeAgentClientReadScope } from '../../../ownership-attribution';
import type { CheckoutCustomData } from '../../types';
import { recordMembershipAttributionRecordedEvent } from './membership-attribution-recorded-event';
import { resolveNewMembershipOwnership, type WebhookUserRecord } from './new-membership-ownership';

export async function recordReadOnlyMembershipAttribution(args: {
  providerEventId?: string;
  tenantId: string;
  userId: string;
  customData: CheckoutCustomData | undefined;
  userRecord?: WebhookUserRecord | null;
}): Promise<void> {
  const ownership = resolveNewMembershipOwnership(args);
  const agentId = ownership.agentId;
  const ownershipSource = ownership.resolvedFrom;
  if (!agentId || !ownershipSource) return;

  const eventId = args.providerEventId
    ? `paddle:${args.tenantId}:${args.providerEventId}:agent-attribution-recorded`
    : undefined;
  try {
    const now = new Date();
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await db.transaction(async tx => {
      await revokeAgentClientReadScope(tx, {
        tenantId: args.tenantId,
        memberId: args.userId,
      });
      await recordMembershipAttributionRecordedEvent({
        eventId,
        memberId: args.userId,
        now,
        ownershipSource,
        tenantId: args.tenantId,
        tx,
      });
    });
  } catch (error) {
    if (!isDomainEventReplay(error, eventId)) throw error;
  }
}

function isDomainEventReplay(error: unknown, eventId: string | undefined): boolean {
  if (!eventId || typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
  };
  const constraint = candidate.constraint ?? candidate.constraint_name;
  return (
    candidate.code === '23505' &&
    (constraint === 'domain_events_pkey' || constraint === 'domain_events_tenant_id_id_uq')
  );
}
