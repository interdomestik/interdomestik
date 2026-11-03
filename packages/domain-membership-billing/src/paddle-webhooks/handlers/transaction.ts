import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { readPaddleCanonicalUser } from './utils/canonical-user';
import { findPaddleSubscriptionByReference } from '../../subscription';
import { transactionEventDataSchema } from '../schemas';
import type { PaddleWebhookAuditDeps } from '../types';

function normalizeAgentId(agentId: string | null | undefined): string | null {
  if (typeof agentId !== 'string') return null;
  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function handleTransactionCompleted(
  params: { data: unknown; delivery: IngressCapability<'paddle-delivery'> },
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
  const context = await resolveTransactionTenantContext({
    delivery: params.delivery,
    subscriptionId,
    userId,
    tenantIdFromCustomData,
    agentIdFromCustomData: customData?.agentId,
    transactionId: tx.id,
  });

  if (!context) {
    console.warn(`[Webhook] Skipping transaction audit for ${tx.id}; tenant context unresolved`);
    return;
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'payment.processed',
      entityType: 'transaction',
      entityId: tx.id,
      authority: context.authority,
      metadata: {
        subscriptionId,
        status: tx.status,
        currency: tx.details?.totals?.currencyCode,
        amount: tx.details?.totals?.total,
        acquisitionSource: customData?.acquisitionSource,
        agentId: context.agentId,
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

async function resolveTransactionTenantContext(args: {
  delivery: IngressCapability<'paddle-delivery'>;
  subscriptionId?: string | null;
  userId?: string | null;
  tenantIdFromCustomData?: string | null;
  agentIdFromCustomData?: string | null;
  transactionId: string;
}): Promise<{ tenantId: string; agentId: string | null; authority: TenantAuthority } | null> {
  const customDataTenantId = normalizeText(args.tenantIdFromCustomData);
  const userId = normalizeText(args.userId);
  const subscriptionId = normalizeText(args.subscriptionId);
  let canonicalTenantId: string | null = null;
  let canonicalAgentId: string | null | undefined;
  let canonicalAuthority: TenantAuthority | null = null;

  if (subscriptionId) {
    const subscriptionLookup = await findPaddleSubscriptionByReference(
      subscriptionId,
      args.delivery
    );
    const subscription = subscriptionLookup?.subscription;
    if (subscription) {
      canonicalAuthority = subscriptionLookup!.authority;
      canonicalTenantId = normalizeText(subscription.tenantId);
      canonicalAgentId = normalizeAgentId(subscription.agentId);

      const subscriptionUserId = normalizeText(subscription.userId);
      if (subscriptionUserId && userId && subscriptionUserId !== userId) {
        console.warn(
          `[Webhook] Transaction ${args.transactionId} user conflict: subscription user=${subscriptionUserId} customData user=${userId}`
        );
        return null;
      }
    }
  }

  if (userId) {
    const userLookup = await readPaddleCanonicalUser(args.delivery, userId);
    const user = userLookup?.user;

    if (!user) {
      console.warn(`[Webhook] Transaction ${args.transactionId} user ${userId} was not found`);
      return null;
    }

    const userTenantId = normalizeText(user.tenantId);
    if (canonicalTenantId && userTenantId && userTenantId !== canonicalTenantId) {
      console.warn(
        `[Webhook] Transaction ${args.transactionId} tenant conflict: subscription tenant=${canonicalTenantId} user tenant=${userTenantId}`
      );
      return null;
    }

    canonicalTenantId = userTenantId ?? canonicalTenantId;
    // The user's tenant wins over the subscription's only when they agree (checked above), so
    // either authority names the same tenant.
    canonicalAuthority = userLookup!.authority;
    canonicalAgentId = normalizeAgentId(user.agentId);
  }

  if (canonicalTenantId && customDataTenantId && customDataTenantId !== canonicalTenantId) {
    console.warn(
      `[Webhook] Transaction ${args.transactionId} tenant conflict: canonical tenant=${canonicalTenantId} customData tenant=${customDataTenantId}`
    );
    return null;
  }

  if (!canonicalTenantId || !canonicalAuthority) {
    return null;
  }
  // The audit row lands in the authority's tenant, so it must be the tenant the checks above settled.
  if (readTenantAuthority(canonicalAuthority).tenantId !== canonicalTenantId) {
    console.warn(
      `[Webhook] Transaction ${args.transactionId} tenant conflict: canonical tenant=${canonicalTenantId} does not match the webhook authority tenant`
    );
    return null;
  }

  return {
    tenantId: canonicalTenantId,
    authority: canonicalAuthority,
    agentId:
      canonicalAgentId !== undefined
        ? canonicalAgentId
        : normalizeAgentId(args.agentIdFromCustomData),
  };
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
