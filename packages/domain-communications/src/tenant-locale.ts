import type { ClaimMailLocale } from './claim-mail/types';

export type TenantLocale = ClaimMailLocale;

export function preferredLocaleForTenant(tenantId: string): TenantLocale {
  if (tenantId === 'tenant_mk') return 'mk';
  if (tenantId === 'pilot-mk') return 'en';
  return 'sq';
}
