import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { sendMemberActivationInvite } from '@/lib/member-activation-invite';
import { isMemberEmailConflictError } from '@interdomestik/domain-leads/member-email-conflict';
import { RetryablePaddleWebhookError } from '@interdomestik/domain-membership-billing/paddle-webhooks';
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

  const { convertLeadToMember, hasTenantLeadForConversion, recordPaddleLeadEmailConflict } =
    await import('@interdomestik/domain-leads');

  const leadBelongsToTenant = await hasTenantLeadForConversion(authority, { leadId });
  if (!leadBelongsToTenant) return;

  let converted: Awaited<ReturnType<typeof convertLeadToMember>>;
  try {
    converted = await convertLeadToMember(authority, { leadId });
  } catch (error) {
    // The conversion is one transaction and replay-safe, so any other failure left nothing behind
    // and redelivery may retry it.
    if (!isMemberEmailConflictError(error)) {
      throw new RetryablePaddleWebhookError('Lead conversion failed', { cause: error });
    }
    // A collision is deterministic, so redelivery cannot heal it: the paid lead is recorded for
    // an operator and the webhook is acknowledged. Nothing is attached, reassigned or invited.
    // Only a failure to record it is retried.
    await recordPaddleLeadEmailConflict(authority, { leadId }).catch(cause => {
      throw new RetryablePaddleWebhookError('Lead email conflict could not be recorded', { cause });
    });
    return;
  }
  // A redelivered event finds the lead converted (no result) and sends nothing twice. A failed
  // invite never fails the webhook: the membership is committed and sign-in stays open.
  if (!converted) return;
  const invite = await sendMemberActivationInvite({ email: converted.email, tenantId });
  if (!invite.sent && invite.reason !== 'email_suppressed') {
    console.error('Member activation invite not sent', {
      userId: converted.userId,
      reason: invite.reason,
    });
  }
}
