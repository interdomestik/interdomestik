import type { subscriptions } from '@interdomestik/database';
import { RetryablePaddleWebhookError } from '../errors';
import type { PastDueEmailDeps } from '../types';
import type { PastDueUserRecord } from './dunning-context';
import { deliverPastDueEffects, persistPastDueEffects } from './dunning-effects';
import { persistOrderedPastDueSubscription, type LockedDunningState } from './dunning-order';
import type { PaddleSubscriptionEventOrder } from './subscription-event-order';

export async function handleOrderedPastDue(args: {
  order: PaddleSubscriptionEventOrder;
  providerSubscriptionId: string;
  subscriptionId: string;
  tenantId: string;
  user: PastDueUserRecord;
  planName: string;
  deps: PastDueEmailDeps;
  buildState: (row: LockedDunningState) => {
    values: Partial<typeof subscriptions.$inferInsert>;
    newDunningCount: number;
    gracePeriodEnd: Date;
  };
}): Promise<void> {
  const ordered = await persistOrderedPastDueSubscription({
    ...args,
    persistEffects: async (tx, state) => {
      let request = null;
      if (state.newDunningCount === 1 && args.user.email) {
        if (!args.deps.preparePastDueEmail) {
          throw new RetryablePaddleWebhookError('Past-due email preparation unavailable');
        }
        request = args.deps.preparePastDueEmail(args.user.email, {
          memberName: args.user.name || 'Member',
          planName: args.planName,
          gracePeriodDays: 14,
          gracePeriodEndDate: state.gracePeriodEnd.toLocaleDateString(),
        });
      }
      await persistPastDueEffects(tx, { ...args, userId: args.user.id, ...state, request });
    },
  });
  if (ordered.kind !== 'stale') await deliverPastDueEffects(args, args.deps);
}
