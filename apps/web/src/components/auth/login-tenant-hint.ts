const TENANT_IDS = new Set(['tenant_mk', 'tenant_ks', 'tenant_al', 'pilot-mk']);

function coerceTenantHint(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return TENANT_IDS.has(normalized) ? normalized : undefined;
}

export function resolveLoginTenantHint(
  searchParams: Pick<URLSearchParams, 'get'>,
  explicitTenantId?: string
): string | undefined {
  return (
    coerceTenantHint(explicitTenantId) ??
    coerceTenantHint(searchParams.get('tenantId')) ??
    coerceTenantHint(searchParams.get('default_booking_tenant_id'))
  );
}
