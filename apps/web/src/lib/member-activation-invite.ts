import { requestPasswordResetOnboarding } from '@/app/api/webhooks/paddle/paddle-onboarding';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';

export type MemberActivationInviteResult =
  { sent: true } | { sent: false; reason: 'unknown_tenant' | 'delivery_failed' };

/**
 * Invites a converted member to set their password (owner decision B, ACQ-2b2). The recipient
 * comes from the committed conversion; the link is the existing password-reset flow on the
 * member's own tenant host, as for Paddle onboarding. Reset delivery is fire-and-forget inside the
 * auth hook, so `sent` means the request was accepted. A failure never undoes the membership: the
 * caller records it, an operator can resend, and the member can use "forgot password".
 */
export async function sendMemberActivationInvite(params: {
  email: string;
  tenantId: string;
}): Promise<MemberActivationInviteResult> {
  // An unknown tenant never falls back to another tenant's host.
  const tenantId = coerceTenantId(params.tenantId);
  if (!tenantId) return { sent: false, reason: 'unknown_tenant' };
  try {
    await requestPasswordResetOnboarding({ email: params.email, tenantId });
    return { sent: true };
  } catch {
    return { sent: false, reason: 'delivery_failed' };
  }
}
