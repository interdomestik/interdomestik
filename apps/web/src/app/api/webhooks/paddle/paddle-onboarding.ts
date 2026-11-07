import { auth } from '@/lib/auth';
import {
  configuredAuthBaseOrigin,
  EmailLinkOriginError,
  resolveTenantEmailOrigins,
} from '@/lib/email-link-origins';
import { coerceTenantId, preferredLocaleForTenant } from '@/lib/tenant/tenant-hosts';

type ResetLink = Readonly<{ redirectTo: string; authOrigin: string }>;

function resetLinkFor(tenantId: string): ResetLink {
  // An unknown tenant never borrows another tenant's host or locale.
  const tenant = coerceTenantId(tenantId);
  if (!tenant) throw new EmailLinkOriginError('unknown_tenant');
  const { authOrigin, appOrigin } = resolveTenantEmailOrigins(tenant);
  const locale = preferredLocaleForTenant(tenant);
  return { authOrigin, redirectTo: new URL(`/${locale}/reset-password`, appOrigin).toString() };
}

export function buildTenantPasswordResetRedirectUrl(tenantId: string): string {
  return resetLinkFor(tenantId).redirectTo;
}

export async function requestPasswordResetOnboarding(params: {
  email: string;
  tenantId: string;
}): Promise<void> {
  const { redirectTo, authOrigin } = resetLinkFor(params.tenantId);
  // Both halves of the emailed link stay on this deployment: Better Auth issues the token on its
  // configured base and redirects only to an origin it trusts. Check both before minting a token.
  if (configuredAuthBaseOrigin(auth.options.baseURL) !== authOrigin) {
    throw new EmailLinkOriginError('auth_origin_mismatch');
  }
  const context = await auth.$context;
  if (!context.isTrustedOrigin(redirectTo)) {
    throw new EmailLinkOriginError('untrusted_callback');
  }
  await auth.api.requestPasswordReset({
    body: {
      email: params.email,
      redirectTo,
    },
  });
}
