import { resolveCanonicalMembershipPlanState } from '../../annual-membership';
import { subscriptionEventDataSchema } from '../schemas';
import { mapPaddleStatus } from '../subscription-status';
import type { PaddleWebhookAuditDeps } from '../types';
import type { PaddleSubscriptionEventOrder } from './subscription-event-order';
import {
  resolveSubscriptionForUpsert,
  upsertSubscription,
  type UpsertSubscriptionResult,
} from './subscription-upsert';

type SubscriptionEventData = ReturnType<typeof subscriptionEventDataSchema.parse>;

export async function writeSubscriptionSnapshot(args: {
  eventType: string;
  providerEventId?: string;
  sub: SubscriptionEventData;
  tenantId: string;
  userId: string;
  agentId: string | null;
  branchId?: string;
  existingSub: Awaited<ReturnType<typeof resolveSubscriptionForUpsert>>;
  order: PaddleSubscriptionEventOrder | undefined;
  priceId: string;
  deps: PaddleWebhookAuditDeps;
}): Promise<UpsertSubscriptionResult> {
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    tenantId: args.tenantId,
    planId: args.priceId,
  });
  const mappedStatus = mapPaddleStatus(args.sub.status);
  const result = await upsertSubscription({
    sub: args.sub,
    tenantId: args.tenantId,
    userId: args.userId,
    agentId: args.agentId,
    branchId: args.branchId,
    existingSub: args.existingSub,
    mappedStatus,
    order: args.order,
    planState: canonicalPlanState,
    providerEventId: args.providerEventId,
  });
  if (!result.stale) {
    if (args.deps.logAuditEvent && result.effectsApplied) {
      await args.deps.logAuditEvent({
        actorRole: 'system',
        action: 'subscription.updated',
        entityType: 'subscription',
        entityId: args.sub.id,
        tenantId: args.tenantId,
        metadata: {
          eventType: args.eventType,
          status: mappedStatus,
          paddleStatus: args.sub.status,
          userId: args.userId,
        },
      });
    }

    console.log(
      `[Webhook] Updated subscription ${args.sub.id} (status: ${mappedStatus}) for user ${args.userId}`
    );
  }
  return result;
}
