import { sendMemberActivationEmail } from '@interdomestik/domain-communications/email/member-activation';
import { normalizeSignInOtpLocale } from '@interdomestik/domain-communications/email';
import {
  coerceTenantId,
  preferredLocaleForTenant,
  resolveTenantAppOrigin,
} from '@/lib/tenant/tenant-hosts';

export type MemberActivationInviteResult =
  { sent: true } | { sent: false; reason: 'unknown_tenant' | 'delivery_failed' };

/**
 * Invites a converted (unverified) member to sign in with an email code on their tenant's own
 * sign-in page. The recipient comes from the committed conversion; the link carries neither a
 * token nor the address. A failure never undoes the membership: the caller records it and the
 * member can still sign in from the login page.
 */
export async function sendMemberActivationInvite(params: {
  email: string;
  tenantId: string;
}): Promise<MemberActivationInviteResult> {
  // An unknown tenant never falls back to another tenant's host.
  const tenantId = coerceTenantId(params.tenantId);
  if (!tenantId) return { sent: false, reason: 'unknown_tenant' };
  const locale = normalizeSignInOtpLocale(preferredLocaleForTenant(tenantId));
  const signInUrl = new URL(`/${locale}/login`, resolveTenantAppOrigin(tenantId)).toString();
  const result = await sendMemberActivationEmail(params.email, signInUrl, locale).catch(() => ({
    success: false as const,
  }));
  return result.success ? { sent: true } : { sent: false, reason: 'delivery_failed' };
}
