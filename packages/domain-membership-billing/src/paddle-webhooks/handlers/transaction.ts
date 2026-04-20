import { db } from '@interdomestik/database';
import { findSubscriptionByProviderReference } from '../../subscription';
import { transactionEventDataSchema } from '../schemas';
import type { PaddleWebhookAuditDeps } from '../types';

function normalizeAgentId(agentId: string | null | undefined): string | null {
  if (typeof agentId !== 'string') return null;
  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function handleTransactionCompleted(
  params: { data: unknown },
  deps: PaddleWebhookAuditDeps = {}
) {
  const parseResult = transactionEventDataSchema.safeParse(params.data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid transaction data:', parseResult.error);
    return;
  }
  const tx = parseResult.data;

  const customData = tx.customData || tx.custom_data;
  const userId = customData?.userId;
  const tenantIdFromCustomData = customData?.tenantId;
  const subscriptionId = tx.subscriptionId || tx.subscription_id;
  const customerId = tx.customerId || tx.customer_id;
  const customerEmail = tx.customerEmail || tx.customer_email;
  let tenantId: string | null = null;
  let canonicalAgentId: string | null | undefined;

  if (subscriptionId) {
    const subscription = await findSubscriptionByProviderReference(subscriptionId);
    tenantId = subscription?.tenantId ?? null;
    if (subscription) {
      canonicalAgentId = normalizeAgentId(subscription.agentId);
    }
  }

  if (userId) {
    const user = await db.query.user.findFirst({
      where: (t, { eq }) => eq(t.id, userId),
      columns: { tenantId: true, agentId: true },
    });
    tenantId = user?.tenantId ?? tenantId;
    if (user) {
      canonicalAgentId = normalizeAgentId(user.agentId);
    }
  }

  tenantId ??= tenantIdFromCustomData ?? null;
  if (canonicalAgentId === undefined) {
    canonicalAgentId = normalizeAgentId(customData?.agentId);
  }

  if (deps.logAuditEvent && tenantId) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'payment.processed',
      entityType: 'transaction',
      entityId: tx.id,
      tenantId,
      metadata: {
        subscriptionId,
        status: tx.status,
        currency: tx.details?.totals?.currencyCode,
        amount: tx.details?.totals?.total,
        acquisitionSource: customData?.acquisitionSource,
        agentId: canonicalAgentId,
        customerEmail,
        customerId,
        userId: userId ?? null,
        utmSource: customData?.utmSource,
        utmMedium: customData?.utmMedium,
        utmCampaign: customData?.utmCampaign,
        utmContent: customData?.utmContent,
      },
    });
  }
}
