import {
  and,
  claimEscalationAgreements,
  claims,
  desc,
  eq,
  subscriptions,
  type DomainEventTx,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { getPaddle } from '../paddle-server';
import { buildCancellationTermsSummary } from './cancellation-policy';
import { resolveProviderSubscriptionHandle } from '../subscription';
import { recordMembershipSubscriptionChangedEvent } from '../paddle-webhooks/handlers/subscription-event';

import type { CancelSubscriptionResult, SubscriptionDeps, SubscriptionSession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function cancelSubscriptionCore(
  params: {
    session: SubscriptionSession | null;
    authority: TenantAuthority | null;
    subscriptionId: string;
    now?: Date;
  },
  deps: SubscriptionDeps = {}
): Promise<CancelSubscriptionResult> {
  const { session, authority, subscriptionId } = params;

  if (!session || !authority) {
    return { error: 'Unauthorized', success: undefined };
  }

  const { tenantId } = readTenantAuthority(authority);
  const sub = await withTenantAuthority(authority, tx =>
    tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
    })
  );

  if (!sub || sub.userId !== session.user.id) {
    return { error: 'Subscription not found or access denied', success: undefined };
  }

  try {
    const providerSubscriptionId = resolveProviderSubscriptionHandle(sub);
    const acceptedEscalationRows = await withTenantAuthority(authority, tx =>
      tx
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
        .limit(1)
    );

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
      const now = new Date();
      await withTenantAuthority(authority, async tx => {
        // db-access-guard: tenant-scoped -- reason: tenantId constrains local cancellation persistence.
        const updatedRows = await tx
          .update(subscriptions)
          .set({
            cancelAtPeriodEnd: true,
            updatedAt: now,
          })
          .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)))
          .returning({ id: subscriptions.id });
        if (updatedRows.length === 0) {
          throw new Error('Scheduled cancellation update matched no subscription rows');
        }
        await recordMembershipSubscriptionChangedEvent({
          actor: { id: session.user.id, role: 'member' },
          cancelAtPeriodEnd: true,
          fromStatus: normalizeSubscriptionStatus(sub.status),
          now,
          subscriptionId,
          tenantId,
          toStatus: normalizeSubscriptionStatus(sub.status, 'active'),
          tx: tx as DomainEventTx,
        });
      });
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
          authority,
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

function normalizeSubscriptionStatus(
  status: string | null | undefined,
  fallback: 'active' | 'canceled' = 'canceled'
) {
  if (
    status === 'active' ||
    status === 'past_due' ||
    status === 'paused' ||
    status === 'canceled' ||
    status === 'trialing' ||
    status === 'expired'
  ) {
    return status;
  }
  return fallback;
}
