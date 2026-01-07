import { db } from '@interdomestik/database';
import { createCommissionCore } from '../../../commissions/create';
import { calculateCommission } from '../../../commissions/types';
import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../../types';

export const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

async function processCommissions(args: {
  sub: any;
  userId: string;
  tenantId: string;
  customData: { agentId?: string } | undefined;
  priceId: string;
  deps: PaddleWebhookAuditDeps;
}) {
  const { sub, userId, tenantId, customData, priceId, deps } = args;
  const agentId = customData?.agentId;
  const transactionTotal = Number.parseFloat(sub.items?.[0]?.price?.unitPrice?.amount || '0') / 100;

  if (!agentId || transactionTotal <= 0) return;

  const agentSettings = await db.query.agentSettings?.findFirst({
    where: (settings, { and, eq }) =>
      and(eq(settings.agentId, agentId), eq(settings.tenantId, tenantId)),
  });
  const customRates = agentSettings?.commissionRates as Record<string, number> | undefined;

  const commissionAmount = calculateCommission('new_membership', transactionTotal, customRates);
  const commissionResult = await createCommissionCore({
    agentId,
    memberId: userId,
    subscriptionId: sub.id,
    type: 'new_membership',
    amount: commissionAmount,
    currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
    tenantId,
    metadata: {
      planId: priceId,
      transactionTotal,
      source: 'paddle_webhook',
      customRates: !!customRates,
    },
  });

  if (deps.logAuditEvent && commissionResult.success) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'commission.created',
      entityType: 'commission',
      entityId: commissionResult.data?.id ?? null,
      tenantId,
      metadata: {
        agentId,
        memberId: userId,
        subscriptionId: sub.id,
        amount: commissionAmount,
        currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
        source: 'paddle_webhook',
      },
    });
  }
  console.log(
    `[Webhook] 💰 Commission created: €${commissionAmount} for agent ${agentId}${customRates ? ' (custom rates)' : ''}`
  );
}

async function processThankYouLetter(args: {
  sub: any;
  userId: string;
  priceId: string;
  userRecord: any;
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'>;
}) {
  const { sub, userId, priceId, userRecord, deps } = args;
  if (!deps.sendThankYouLetter || !userRecord) return;

  try {
    const planPrice = sub.items?.[0]?.price?.unitPrice?.amount
      ? (Number.parseFloat(sub.items[0].price.unitPrice.amount) / 100).toFixed(2)
      : '20.00';
    const periodEnd = sub.currentBillingPeriod?.endsAt
      ? new Date(sub.currentBillingPeriod.endsAt)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await deps.sendThankYouLetter({
      email: userRecord.email,
      memberName: userRecord.name,
      memberNumber: userRecord.memberNumber || `M-${userId.slice(0, 8).toUpperCase()}`,
      planName: priceId || 'Standard',
      planPrice: `€${planPrice}`,
      planInterval: 'year',
      memberSince: new Date(),
      expiresAt: periodEnd,
      locale: 'en',
    });
    console.log(`[Webhook] 📧 Thank-you Letter sent to ${redactEmail(userRecord.email)}`);
  } catch (emailError) {
    console.error('[Webhook] Failed to send Thank-you Letter:', emailError);
  }
}

export async function handleNewSubscriptionExtras(args: {
  sub: any;
  userId: string;
  tenantId: string;
  customData: { agentId?: string } | undefined;
  priceId: string;
  userRecord: any;
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'> & PaddleWebhookAuditDeps;
}) {
  await processCommissions(args);
  await processThankYouLetter(args);
}
