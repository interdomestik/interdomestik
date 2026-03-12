import {
  and,
  claimEscalationAgreements,
  claims,
  db,
  eq,
  subscriptions,
} from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { getPaddle } from '../paddle-server';
import { buildCancellationTermsSummary } from './cancellation-policy';

import type { CancelSubscriptionResult, SubscriptionDeps, SubscriptionSession } from './types';

export async function cancelSubscriptionCore(
  params: {
    session: SubscriptionSession | null;
    subscriptionId: string;
    now?: Date;
  },
  deps: SubscriptionDeps = {}
): Promise<CancelSubscriptionResult> {
  const { session, subscriptionId } = params;

  if (!session) {
    return { error: 'Unauthorized', success: undefined };
  }

  const tenantId = ensureTenantId(session);
  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
  });

  if (!sub || sub.userId !== session.user.id) {
    return { error: 'Subscription not found or access denied', success: undefined };
  }

  try {
    const acceptedEscalationRows = await db
      .select({ claimId: claimEscalationAgreements.claimId })
      .from(claimEscalationAgreements)
      .innerJoin(claims, eq(claimEscalationAgreements.claimId, claims.id))
      .where(
        and(
          eq(claimEscalationAgreements.tenantId, tenantId),
          eq(claims.tenantId, tenantId),
          eq(claims.userId, session.user.id)
        )
      )
      .limit(1);

    const cancellationTerms = buildCancellationTermsSummary({
      purchasedAt: sub.createdAt ?? null,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      hasAcceptedEscalation: acceptedEscalationRows.length > 0,
      now: params.now,
    });

    const paddle = getPaddle({ tenantId });
    await paddle.subscriptions.cancel(subscriptionId, {
      effectiveFrom: 'next_billing_period',
    });

    await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: 'member',
        action: 'subscription.canceled_scheduled',
        entityType: 'subscription',
        entityId: subscriptionId,
        tenantId,
        metadata: {
          effectiveFrom: 'next_billing_period',
          refundStatus: cancellationTerms.refundStatus,
          hasAcceptedEscalation: cancellationTerms.hasAcceptedEscalation,
        },
      });
    }

    return { success: true, error: undefined, cancellationTerms };
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return { error: 'Failed to cancel subscription', success: undefined };
  }
}
