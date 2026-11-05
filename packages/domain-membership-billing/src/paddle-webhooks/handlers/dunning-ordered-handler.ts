import type { subscriptions } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { PaddleEventOrderingError, RetryablePaddleWebhookError } from '../errors';
import type { PastDueEmailDeps } from '../types';
import type { PastDueUserRecord } from './dunning-context';
import { deliverPastDueEffects } from './dunning-effects';
import { persistOrderedPastDueSubscription, type LockedDunningState } from './dunning-order';
import type { PaddleSubscriptionEventOrder } from './subscription-event-order';

export async function handleOrderedPastDue(args: {
  order: PaddleSubscriptionEventOrder;
  providerSubscriptionId: string;
  subscriptionId: string;
  authority: TenantAuthority;
  user: PastDueUserRecord;
  planName: string;
  deps: PastDueEmailDeps;
  buildState: (row: LockedDunningState) => {
    values: Partial<typeof subscriptions.$inferInsert>;
    newDunningCount: number;
    gracePeriodEnd: Date;
  };
}): Promise<void> {
  try {
    const ordered = await persistOrderedPastDueSubscription({
      order: args.order,
      providerSubscriptionId: args.providerSubscriptionId,
      subscriptionId: args.subscriptionId,
      authority: args.authority,
      buildState: args.buildState,
      // Runs inside the ordered transaction: a failure here rolls the snapshot back.
      effects: state => {
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
        return {
          userId: args.user.id,
          newDunningCount: state.newDunningCount,
          gracePeriodEnd: state.gracePeriodEnd,
          request,
        };
      },
    });
    if (ordered.kind !== 'stale') await deliverPastDueEffects(args, args.deps);
  } catch (error) {
    if (error instanceof PaddleEventOrderingError || error instanceof RetryablePaddleWebhookError) {
      throw error;
    }
    // Atomic writes and the immutable delivery intent make these failures replayable.
    throw new RetryablePaddleWebhookError(
      error instanceof Error ? error.message : 'Ordered past-due recovery failed'
    );
  }
}
