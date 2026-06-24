import { coerceTenantId, type TenantId } from '@/lib/tenant/tenant-hosts';

type TenantHintResult =
  | { kind: 'absent' }
  | { kind: 'valid'; tenantId: TenantId }
  | { kind: 'invalid' };

function readAdditionalData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const additionalData = (body as { additionalData?: unknown }).additionalData;
  if (!additionalData || typeof additionalData !== 'object') return null;
  return additionalData as Record<string, unknown>;
}

export function resolveSignInAdditionalTenantHint(body: unknown): TenantHintResult {
  const additionalData = readAdditionalData(body);
  if (!additionalData) return { kind: 'absent' };

  const rawTenantId = additionalData.tenantId ?? additionalData.default_booking_tenant_id;
  if (typeof rawTenantId !== 'string') return { kind: 'invalid' };

  const tenantId = coerceTenantId(rawTenantId.trim());
  return tenantId ? { kind: 'valid', tenantId } : { kind: 'invalid' };
}
