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
  const subscriptionId = tx.subscriptionId || tx.subscription_id;

  if (userId && subscriptionId) {
    // Resolve Tenant for Audit Log
    const user = await db.query.user.findFirst({
      where: (t, { eq }) => eq(t.id, userId),
      columns: { tenantId: true },
    });

    if (deps.logAuditEvent && user?.tenantId) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'payment.processed',
        entityType: 'transaction',
        entityId: tx.id,
        tenantId: user.tenantId,
        metadata: {
          subscriptionId,
          status: tx.status,
          currency: tx.details?.totals?.currencyCode,
          amount: tx.details?.totals?.total,
        },
      });
    }
  }
}
