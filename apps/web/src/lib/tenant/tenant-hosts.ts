export type TenantId = 'tenant_mk' | 'tenant_ks' | 'tenant_al' | 'pilot-mk';
export type TenantLocale = 'sq' | 'en' | 'sr' | 'mk';

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

export type TenantResolutionSource = 'host' | 'cookie' | 'header' | 'query' | 'default_public';

export type TenantResolutionResult = {
  tenantId: TenantId;
  source: TenantResolutionSource;
};

function resolveDefaultPublicTenantId(): TenantId {
  const configured = coerceTenantId(process.env.DEFAULT_PUBLIC_TENANT_ID);
  return configured ?? 'tenant_ks';
}

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
  return (
    value === 'tenant_mk' || value === 'tenant_ks' || value === 'tenant_al' || value === 'pilot-mk'
  );
}

function hostsForTenant(tenantId: TenantId): string[] {
  const envHosts: string[] = [];

  if (tenantId === 'tenant_mk' && process.env.MK_HOST) envHosts.push(process.env.MK_HOST);
  if (tenantId === 'tenant_ks' && process.env.KS_HOST) envHosts.push(process.env.KS_HOST);
  if (tenantId === 'tenant_al' && process.env.AL_HOST) envHosts.push(process.env.AL_HOST);
  if (tenantId === 'pilot-mk' && process.env.PILOT_HOST) envHosts.push(process.env.PILOT_HOST);

  // Canonical production hosts
  const canonical =
    tenantId === 'tenant_mk'
      ? ['mk.interdomestik.com']
      : tenantId === 'tenant_ks'
        ? ['ks.interdomestik.com']
        : tenantId === 'tenant_al'
          ? ['al.interdomestik.com']
          : ['pilot.interdomestik.com'];

  // Local development convenience (documented in docs/tenant-domains.md)
  const local =
    tenantId === 'tenant_mk'
      ? ['mk.localhost']
      : tenantId === 'tenant_ks'
        ? ['ks.localhost']
        : tenantId === 'tenant_al'
          ? ['al.localhost']
          : ['pilot.localhost'];

  // Include both host-only and host:port variants from env.
  // We match against both because `Host` may include a port in dev.
  return [...canonical, ...local, ...envHosts].filter(Boolean);
}

function canonicalHostForTenant(tenantId: TenantId): string {
  return tenantId === 'tenant_mk'
    ? 'mk.interdomestik.com'
    : tenantId === 'tenant_ks'
      ? 'ks.interdomestik.com'
      : tenantId === 'tenant_al'
        ? 'al.interdomestik.com'
        : 'pilot.interdomestik.com';
}

function localHostForTenant(tenantId: TenantId): string {
  return tenantId === 'tenant_mk'
    ? 'mk.localhost'
    : tenantId === 'tenant_ks'
      ? 'ks.localhost'
      : tenantId === 'tenant_al'
        ? 'al.localhost'
        : 'pilot.localhost';
}

function envHostForTenant(tenantId: TenantId): string | null {
  if (tenantId === 'tenant_mk') return process.env.MK_HOST ?? null;
  if (tenantId === 'tenant_ks') return process.env.KS_HOST ?? null;
  if (tenantId === 'tenant_al') return process.env.AL_HOST ?? null;
  return process.env.PILOT_HOST ?? null;
}

export function resolveTenantFromHost(host: string): TenantId | null {
  const normalized = normalizeHost(host);
  const normalizedWithPort = normalizeHostWithPort(host);

  for (const tenantId of ['tenant_mk', 'tenant_ks', 'tenant_al', 'pilot-mk'] as const) {
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
  if (/^al\./i.test(normalized)) return 'tenant_al';
  if (/^pilot\./i.test(normalized)) return 'pilot-mk';

  return null;
}

export function isTenantHost(host: string): boolean {
  return resolveTenantFromHost(host) !== null;
}

export function coerceTenantId(value: string | null | undefined): TenantId | null {
  if (!value) return null;
  return isTenantId(value) ? value : null;
}

export function preferredLocaleForTenant(tenantId: TenantId): TenantLocale {
  if (tenantId === 'tenant_mk') return 'mk';
  if (tenantId === 'pilot-mk') return 'en';
  return 'sq';
}

export function preferredHostForTenant(tenantId: TenantId): string {
  const envHost = envHostForTenant(tenantId);
  if (envHost) return envHost;
  return isProductionLikeEnvironment()
    ? canonicalHostForTenant(tenantId)
    : localHostForTenant(tenantId);
}

export function resolveTenantAppOrigin(tenantId: TenantId): string {
  const host = preferredHostForTenant(tenantId);
  const useHttp =
    host.includes('localhost') || host.includes('127.0.0.1') || host.includes('.nip.io');
  return `${useHttp ? 'http' : 'https'}://${host}`;
}

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function resolveTenantIdFromSources(
  sources: TenantResolutionSources,
  options: TenantResolutionOptions = {}
): TenantId {
  return resolveTenantContextFromSources(sources, options).tenantId;
}

export function resolveTenantContextFromSources(
  sources: TenantResolutionSources,
  options: TenantResolutionOptions = {}
): TenantResolutionResult {
  const hostTenant = resolveTenantFromHost(sources.host ?? '');
  if (hostTenant) return { tenantId: hostTenant, source: 'host' };

  const cookieTenant = coerceTenantId(sources.cookieTenantId);
  if (cookieTenant) return { tenantId: cookieTenant, source: 'cookie' };

  const headerTenant = coerceTenantId(sources.headerTenantId);
  if (headerTenant) return { tenantId: headerTenant, source: 'header' };

  const allowQueryFallback = !(options.productionSensitive && isProductionLikeEnvironment());
  if (allowQueryFallback) {
    const queryTenant = coerceTenantId(sources.queryTenantId);
    if (queryTenant) return { tenantId: queryTenant, source: 'query' };
  }

  return { tenantId: resolveDefaultPublicTenantId(), source: 'default_public' };
}

export function hasHostSessionTenantMismatch(
  hostTenantId: TenantId | null,
  sessionTenantId: string | null | undefined
): boolean {
  if (!hostTenantId) return false;
  const normalizedSessionTenantId = coerceTenantId(sessionTenantId ?? undefined);
  return normalizedSessionTenantId !== null && normalizedSessionTenantId !== hostTenantId;
}
