export type TenantId = 'tenant_mk' | 'tenant_ks';

export const TENANT_COOKIE_NAME = 'tenantId';
export const TENANT_HEADER_NAME = 'x-tenant-id';

export type TenantResolutionSources = {
  host?: string | null;
  cookieTenantId?: string | null;
  headerTenantId?: string | null;
  queryTenantId?: string | null;
};

export type TenantResolutionOptions = {
  productionSensitive?: boolean;
};

function normalizeHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  const withoutPort = raw.replace(/:\d+$/, '');
  return withoutPort.toLowerCase().replace(/\.$/, '');
}

function normalizeHostWithPort(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  return raw.toLowerCase().replace(/\.$/, '');
}

function isTenantId(value: string | null | undefined): value is TenantId {
  return value === 'tenant_mk' || value === 'tenant_ks';
}

function hostsForTenant(tenantId: TenantId): string[] {
  const envHosts: string[] = [];

  if (tenantId === 'tenant_mk' && process.env.MK_HOST) envHosts.push(process.env.MK_HOST);
  if (tenantId === 'tenant_ks' && process.env.KS_HOST) envHosts.push(process.env.KS_HOST);

  // Canonical production hosts
  const canonical =
    tenantId === 'tenant_mk'
      ? ['mk.interdomestik.com']
      : tenantId === 'tenant_ks'
        ? ['ks.interdomestik.com']
        : [];

  // Local development convenience (documented in docs/tenant-domains.md)
  const local = tenantId === 'tenant_mk' ? ['mk.localhost'] : ['ks.localhost'];

  // Include both host-only and host:port variants from env.
  // We match against both because `Host` may include a port in dev.
  return [...canonical, ...local, ...envHosts].filter(Boolean);
}

export function resolveTenantFromHost(host: string): TenantId | null {
  const normalized = normalizeHost(host);
  const normalizedWithPort = normalizeHostWithPort(host);

  for (const tenantId of ['tenant_mk', 'tenant_ks'] as const) {
    for (const candidate of hostsForTenant(tenantId)) {
      const candidateNormalized = normalizeHost(candidate);
      const candidateWithPort = normalizeHostWithPort(candidate);

      if (normalized === candidateNormalized) return tenantId;
      if (normalizedWithPort === candidateWithPort) return tenantId;
    }
  }

  // Robust CI/Local fallback using nip.io (wildcard-like)
  // Matches: ks.127.0.0.1.nip.io, mk.127.0.0.1.nip.io, etc.
  if (/^mk\./i.test(normalized)) return 'tenant_mk';
  if (/^ks\./i.test(normalized)) return 'tenant_ks';

  return null;
}

export function isTenantHost(host: string): boolean {
  return resolveTenantFromHost(host) !== null;
}

export function coerceTenantId(value: string | null | undefined): TenantId | null {
  if (!value) return null;
  return isTenantId(value) ? value : null;
}

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function resolveTenantIdFromSources(
  sources: TenantResolutionSources,
  options: TenantResolutionOptions = {}
): TenantId | null {
  const hostTenant = resolveTenantFromHost(sources.host ?? '');
  if (hostTenant) return hostTenant;

  if (options.productionSensitive && isProductionLikeEnvironment()) {
    return null;
  }

  const cookieTenant = coerceTenantId(sources.cookieTenantId);
  if (cookieTenant) return cookieTenant;

  const headerTenant = coerceTenantId(sources.headerTenantId);
  if (headerTenant) return headerTenant;

  const queryTenant = coerceTenantId(sources.queryTenantId);
  if (queryTenant) return queryTenant;

  return null;
}

export function hasHostSessionTenantMismatch(
  hostTenantId: TenantId | null,
  sessionTenantId: string | null | undefined
): boolean {
  if (!hostTenantId) return false;
  const normalizedSessionTenantId = coerceTenantId(sessionTenantId ?? undefined);
  return normalizedSessionTenantId !== null && normalizedSessionTenantId !== hostTenantId;
}
