import { auth } from '@/lib/auth';
import {
  coerceTenantId,
  preferredLocaleForTenant,
  resolveDefaultPublicTenantId,
  resolveTenantAppOrigin,
} from '@/lib/tenant/tenant-hosts';

export function buildTenantPasswordResetRedirectUrl(tenantId: string): string {
  const normalizedTenantId = coerceTenantId(tenantId) ?? resolveDefaultPublicTenantId();
  const origin = resolveTenantAppOrigin(normalizedTenantId);
  const locale = preferredLocaleForTenant(normalizedTenantId);
  return new URL(`/${locale}/reset-password`, origin).toString();
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
