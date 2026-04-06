import { db } from '@interdomestik/database';
import { transactionEventDataSchema } from '../schemas';
import type { PaddleWebhookAuditDeps } from '../types';

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
  let tenantId = tenantIdFromCustomData ?? null;

  if (userId) {
    const user = await db.query.user.findFirst({
      where: (t, { eq }) => eq(t.id, userId),
      columns: { tenantId: true },
    });
    tenantId = user?.tenantId ?? tenantId;
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
        agentId: customData?.agentId,
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
