import { auth } from '@/lib/auth';
import { EmailLinkOriginError, resolveTenantEmailOrigins } from '@/lib/email-link-origins';
import { coerceTenantId, preferredLocaleForTenant } from '@/lib/tenant/tenant-hosts';

/**
 * The reset page an emailed link returns to. It stays on this deployment: the canonical tenant
 * host only on a verified production deployment, otherwise this deployment's own auth origin or
 * an explicit tenant host it serves. An unknown tenant never borrows another tenant's host or
 * locale, and an origin that cannot be established throws before any token is minted.
 * `paddle-onboarding.trust.test.ts` pins that Better Auth trusts every URL this returns.
 */
export function buildTenantPasswordResetRedirectUrl(tenantId: string): string {
  const tenant = coerceTenantId(tenantId);
  if (!tenant) throw new EmailLinkOriginError('unknown_tenant');
  const { appOrigin } = resolveTenantEmailOrigins(tenant);
  const locale = preferredLocaleForTenant(tenant);
  return new URL(`/${locale}/reset-password`, appOrigin).toString();
}

export async function requestPasswordResetOnboarding(params: {
  email: string;
  tenantId: string;
}): Promise<void> {
  await auth.api.requestPasswordReset({
    body: {
      email: params.email,
      redirectTo: buildTenantPasswordResetRedirectUrl(params.tenantId),
    },
  });
}
