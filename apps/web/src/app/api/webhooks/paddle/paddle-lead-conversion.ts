import { getPaddleLeadId } from './paddle-lead-id';
import {
  getPaddleCustomData,
  normalizeText,
  type WebhookSubscription,
} from './paddle-webhook-resolution';

function hasLeadConversionProviderConflict(params: {
  data: unknown;
  tenantId: string;
  subscription: WebhookSubscription | null;
}): boolean {
  const customData = getPaddleCustomData(params.data);
  const providerUserId = normalizeText(customData?.userId);
  const providerTenantId = normalizeText(customData?.tenantId);
  const subscriptionTenantId = normalizeText(params.subscription?.tenantId);
  const subscriptionUserId = normalizeText(params.subscription?.userId);

  if (providerTenantId && providerTenantId !== params.tenantId) return true;
  if (subscriptionTenantId && subscriptionTenantId !== params.tenantId) return true;
  if (params.subscription && providerUserId && !subscriptionUserId) return true;
  if (subscriptionUserId && providerUserId && subscriptionUserId !== providerUserId) return true;

  return false;
}

export async function reconcilePaddleLeadConversion(params: {
  eventType: string | undefined;
  data: unknown;
  tenantId: string | null;
  subscription: WebhookSubscription | null;
}): Promise<void> {
  if (params.eventType !== 'transaction.completed' || !params.tenantId) return;

  const leadId = getPaddleLeadId(params.data);
  if (!leadId) return;

  if (
    hasLeadConversionProviderConflict({
      data: params.data,
      tenantId: params.tenantId,
      subscription: params.subscription,
    })
  ) {
    return;
  }

  const { convertLeadToMember, hasTenantLeadForConversion } =
    await import('@interdomestik/domain-leads');

  const leadBelongsToTenant = await hasTenantLeadForConversion(
    { tenantId: params.tenantId },
    { leadId }
  );
  if (!leadBelongsToTenant) return;

  await convertLeadToMember({ tenantId: params.tenantId }, { leadId });
}
