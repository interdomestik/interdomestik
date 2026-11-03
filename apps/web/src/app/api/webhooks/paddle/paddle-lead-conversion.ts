import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
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
  /** The webhook's tenant authority, minted from a resolver-owned subscription or user. */
  authority: TenantAuthority | null;
  subscription: WebhookSubscription | null;
}): Promise<void> {
  if (params.eventType !== 'transaction.completed' || !params.authority) return;
  const { authority } = params;
  const { tenantId } = readTenantAuthority(authority);

  const leadId = getPaddleLeadId(params.data);
  if (!leadId) return;

  if (
    hasLeadConversionProviderConflict({
      data: params.data,
      tenantId,
      subscription: params.subscription,
    })
  ) {
    return;
  }

  const { convertLeadToMember, hasTenantLeadForConversion } =
    await import('@interdomestik/domain-leads');

  const leadBelongsToTenant = await hasTenantLeadForConversion(authority, { leadId });
  if (!leadBelongsToTenant) return;

  await convertLeadToMember(authority, { leadId });
}
