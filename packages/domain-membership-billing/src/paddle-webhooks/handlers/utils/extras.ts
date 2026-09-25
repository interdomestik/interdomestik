import { db } from '@interdomestik/database';
import { referrals } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionCore } from '../../../commissions/create';
import { createRenewalCommissionCore } from '../../../commissions/create-renewal';
import { calculateCommission } from '../../../commissions/types';
import { revokeAgentClientReadScope } from '../../../ownership-attribution';
import type { CheckoutCustomData, PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../../types';
import { processMembershipConfirmation } from './membership-confirmation';
import { recordMembershipAttributionRecordedEvent } from './membership-attribution-recorded-event';
import {
  resolveNewMembershipOwnership,
  toOwnershipResolvedFrom,
  type WebhookUserRecord,
} from './new-membership-ownership';

export { redactEmail } from './membership-confirmation';

async function processCommissions(args: {
  internalSubscriptionId?: string;
  sub: any;
  userId: string;
  tenantId: string;
  customData: CheckoutCustomData | undefined;
  userRecord?: WebhookUserRecord | null;
  priceId: string;
  deps: PaddleWebhookAuditDeps;
}) {
  const { internalSubscriptionId, sub, userId, tenantId, customData, userRecord, priceId, deps } =
    args;
  const resolvedSubscriptionId = internalSubscriptionId ?? sub.id;
  const ownership = resolveNewMembershipOwnership({ userRecord, customData });
  const agentId = ownership.agentId;
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
    subscriptionId: resolvedSubscriptionId,
    type: 'new_membership',
    amount: commissionAmount,
    currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
    tenantId,
    metadata: {
      planId: priceId,
      transactionTotal,
      source: 'paddle_webhook',
      customRates: !!customRates,
      saleOwnerType: 'agent',
      saleOwnerId: agentId,
      originalSellerAgentId: agentId,
      ownershipResolvedFrom: toOwnershipResolvedFrom(ownership.resolvedFrom),
      ownershipDiagnostics: [],
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
        subscriptionId: resolvedSubscriptionId,
        amount: commissionAmount,
        currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
        source: 'paddle_webhook',
        saleOwnerType: 'agent',
        saleOwnerId: agentId,
        originalSellerAgentId: agentId,
        ownershipResolvedFrom: toOwnershipResolvedFrom(ownership.resolvedFrom),
      },
    });
  }
  console.log(
    `[Webhook] 💰 Commission created: €${commissionAmount} for agent ${agentId}${customRates ? ' (custom rates)' : ''}`
  );
}

async function processMemberReferralRewards(args: {
  internalSubscriptionId?: string;
  sub: any;
  userId: string;
  tenantId: string;
  customData: CheckoutCustomData | undefined;
  userRecord?: WebhookUserRecord | null;
  deps: PaddleWebhookAuditDeps;
}) {
  const { internalSubscriptionId, sub, userId, tenantId, customData, userRecord, deps } = args;
  const resolvedSubscriptionId = internalSubscriptionId ?? sub.id;

  if (resolveNewMembershipOwnership({ userRecord, customData }).agentId) return;

  const referralRow = await db.query.referrals.findFirst({
    where: and(eq(referrals.tenantId, tenantId), eq(referrals.referredId, userId)),
    columns: {
      id: true,
    },
  });

  const rewardResult = await createMemberReferralRewardCore({
    tenantId,
    referralId: referralRow?.id ?? null,
    subscriptionId: resolvedSubscriptionId,
    qualifyingEventId: sub.id,
    qualifyingEventType: 'first_paid_membership',
    paymentAmountCents: Number.parseInt(sub.items?.[0]?.price?.unitPrice?.amount || '0', 10),
    currencyCode: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
    metadata: {
      source: 'paddle_webhook',
    },
  });

  if (deps.logAuditEvent && rewardResult.success && rewardResult.data.kind === 'created') {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'referral.reward.created',
      entityType: 'referral_reward',
      entityId: rewardResult.data.id,
      tenantId,
      metadata: {
        memberId: userId,
        subscriptionId: resolvedSubscriptionId,
        rewardCents: rewardResult.data.rewardCents,
        currency: rewardResult.data.currencyCode,
        source: 'paddle_webhook',
      },
    });
  }
}

async function recordReadOnlyMembershipAttribution(args: {
  tenantId: string;
  userId: string;
  customData: CheckoutCustomData | undefined;
  userRecord?: WebhookUserRecord | null;
}) {
  const ownership = resolveNewMembershipOwnership(args);
  const agentId = ownership.agentId;
  const ownershipSource = ownership.resolvedFrom;
  if (!agentId || !ownershipSource) return;

  const now = new Date();
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  await db.transaction(async tx => {
    await revokeAgentClientReadScope(tx, {
      tenantId: args.tenantId,
      memberId: args.userId,
    });
    await recordMembershipAttributionRecordedEvent({
      memberId: args.userId,
      now,
      ownershipSource,
      tenantId: args.tenantId,
      tx,
    });
  });
}

async function processRenewalCommissions(args: {
  internalSubscriptionId?: string;
  sub: any;
  userId: string;
  tenantId: string;
  priceId: string;
  ownership?: {
    subscriptionAgentId?: string | null;
    userAgentId?: string | null;
    agentClientAgentIds?: Array<string | null | undefined>;
    originalSellerAgentId?: string | null;
  };
  deps: PaddleWebhookAuditDeps;
}) {
  const { internalSubscriptionId, sub, userId, tenantId, priceId, ownership, deps } = args;
  const resolvedSubscriptionId = internalSubscriptionId ?? sub.id;
  const transactionTotal = Number.parseFloat(sub.items?.[0]?.price?.unitPrice?.amount || '0') / 100;
  if (transactionTotal <= 0) return;

  const subscriptionAgentId = ownership?.subscriptionAgentId;

  const commissionResult = await createRenewalCommissionCore({
    tenantId,
    memberId: userId,
    subscriptionId: resolvedSubscriptionId,
    priceId,
    transactionTotal,
    currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
    subscriptionAgentId,
    userAgentId: ownership?.userAgentId ?? null,
    agentClientAgentIds: ownership?.agentClientAgentIds ?? [],
    originalSellerAgentId: ownership?.originalSellerAgentId ?? null,
  });

  if (deps.logAuditEvent && commissionResult.success && commissionResult.data.kind === 'created') {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'commission.created',
      entityType: 'commission',
      entityId: commissionResult.data.id,
      tenantId,
      metadata: {
        memberId: userId,
        subscriptionId: resolvedSubscriptionId,
        source: 'paddle_webhook',
        type: 'renewal',
      },
    });
  }

  if (
    deps.logAuditEvent &&
    commissionResult.success &&
    commissionResult.data.kind === 'no-op' &&
    commissionResult.data.noCommissionReason === 'unresolved'
  ) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'commission.unresolved',
      entityType: 'commission',
      entityId: null,
      tenantId,
      metadata: {
        memberId: userId,
        subscriptionId: resolvedSubscriptionId,
        source: 'paddle_webhook',
        noCommissionReason: commissionResult.data.noCommissionReason,
        ownershipDiagnostics: commissionResult.data.ownershipDiagnostics,
      },
    });
  }
}

export async function handleNewSubscriptionExtras(args: {
  eventType: string;
  internalSubscriptionId?: string;
  sub: any;
  userId: string;
  tenantId: string;
  customData: CheckoutCustomData | undefined;
  priceId: string;
  userRecord: WebhookUserRecord | null;
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'> & PaddleWebhookAuditDeps;
}) {
  await processCommissions(args);
  await recordReadOnlyMembershipAttribution(args);
  await processMemberReferralRewards(args);
  await processMembershipConfirmation(args);
}

export async function handleRenewalSubscriptionExtras(args: {
  internalSubscriptionId?: string;
  sub: any;
  userId: string;
  tenantId: string;
  customData: CheckoutCustomData | undefined;
  priceId: string;
  userRecord: any;
  ownership?: {
    subscriptionAgentId?: string | null;
    userAgentId?: string | null;
    agentClientAgentIds?: Array<string | null | undefined>;
    originalSellerAgentId?: string | null;
  };
  deps: PaddleWebhookAuditDeps;
}) {
  await processRenewalCommissions(args);
}
