import {
  and,
  claimEscalationAgreements,
  claims,
  db,
  desc,
  eq,
  subscriptions,
} from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { getPaddle } from '../paddle-server';
import { buildCancellationTermsSummary } from './cancellation-policy';
import { resolveProviderSubscriptionHandle } from '../subscription';

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
    const providerSubscriptionId = resolveProviderSubscriptionHandle(sub);
    const acceptedEscalationRows = await db
      .select({ acceptedAt: claimEscalationAgreements.acceptedAt })
      .from(claimEscalationAgreements)
      .innerJoin(claims, eq(claimEscalationAgreements.claimId, claims.id))
      .where(
        and(
          eq(claimEscalationAgreements.tenantId, tenantId),
          eq(claims.tenantId, tenantId),
          eq(claims.userId, session.user.id)
        )
      )
      .orderBy(desc(claimEscalationAgreements.acceptedAt))
      .limit(1);

    const hasAcceptedEscalation =
      acceptedEscalationRows.length > 0 &&
      (!sub.createdAt || acceptedEscalationRows[0].acceptedAt.getTime() >= sub.createdAt.getTime());

    const cancellationTerms = buildCancellationTermsSummary({
      purchasedAt: sub.createdAt ?? null,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      hasAcceptedEscalation,
      now: params.now,
    });

    const paddle = getPaddle({ tenantId });
    await paddle.subscriptions.cancel(providerSubscriptionId, {
      effectiveFrom: 'next_billing_period',
    });

    let localPersistenceFailed = false;
    try {
      await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));
    } catch (error) {
      localPersistenceFailed = true;
      console.error('Failed to persist scheduled subscription cancellation:', error);
    }

    if (deps.logAuditEvent) {
      try {
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
            localPersistenceFailed,
          },
        });
      } catch (error) {
        console.error('Failed to log scheduled subscription cancellation audit event:', error);
      }
    }

    return { success: true, error: undefined, cancellationTerms };
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return { error: 'Failed to cancel subscription', success: undefined };
  }
}
