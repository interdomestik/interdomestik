export type TenantId = 'tenant_mk' | 'tenant_ks' | 'tenant_al' | 'pilot-mk';
export type CountryHostAliasLabel = 'mk' | 'ks' | 'al' | 'pilot';

type AliasConfig = {
  label: CountryHostAliasLabel;
  tenantId: TenantId;
  envKey: 'MK_HOST' | 'KS_HOST' | 'AL_HOST' | 'PILOT_HOST';
  canonicalHost: string;
  localHost: string;
};

export type CountryHostCompatibilityAlias = {
  kind: 'country_host_compatibility_alias';
  label: CountryHostAliasLabel;
  tenantId: TenantId;
  defaultBookingTenantId: TenantId;
};

const ALIASES: readonly AliasConfig[] = [
  {
    label: 'mk',
    tenantId: 'tenant_mk',
    envKey: 'MK_HOST',
    canonicalHost: 'mk.interdomestik.com',
    localHost: 'mk.localhost',
  },
  {
    label: 'ks',
    tenantId: 'tenant_ks',
    envKey: 'KS_HOST',
    canonicalHost: 'ks.interdomestik.com',
    localHost: 'ks.localhost',
  },
  {
    label: 'al',
    tenantId: 'tenant_al',
    envKey: 'AL_HOST',
    canonicalHost: 'al.interdomestik.com',
    localHost: 'al.localhost',
  },
  {
    label: 'pilot',
    tenantId: 'pilot-mk',
    envKey: 'PILOT_HOST',
    canonicalHost: 'pilot.interdomestik.com',
    localHost: 'pilot.localhost',
  },
];

function normalizeHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  const withoutPort = raw.replace(/:\d+$/, '');
  return withoutPort.toLowerCase().replace(/\.$/, '');
}

function normalizeHostWithPort(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  return raw.toLowerCase().replace(/\.$/, '');
}

function envHost(config: AliasConfig): string | null {
  return process.env[config.envKey] ?? null;
}

function hostsForAlias(config: AliasConfig): string[] {
  return [config.canonicalHost, config.localHost, envHost(config)].filter((host): host is string =>
    Boolean(host)
  );
}

function aliasForTenant(tenantId: TenantId): AliasConfig {
  const config = ALIASES.find(alias => alias.tenantId === tenantId);
  if (!config) throw new Error(`Missing country host alias for tenant ${tenantId}`);
  return config;
}

function toCompatibilityAlias(config: AliasConfig): CountryHostCompatibilityAlias {
  return {
    kind: 'country_host_compatibility_alias',
    label: config.label,
    tenantId: config.tenantId,
    defaultBookingTenantId: config.tenantId,
  };
}

function isLocalNipIoAlias(host: string, label: CountryHostAliasLabel): boolean {
  const octet = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
  return new RegExp(`^${label}\\.${octet}\\.${octet}\\.${octet}\\.${octet}\\.nip\\.io$`).test(host);
}

export function resolveCountryHostCompatibilityAlias(
  host: string
): CountryHostCompatibilityAlias | null {
  const normalized = normalizeHost(host);
  const normalizedWithPort = normalizeHostWithPort(host);

  for (const config of ALIASES) {
    for (const candidate of hostsForAlias(config)) {
      if (normalized === normalizeHost(candidate)) return toCompatibilityAlias(config);
      if (normalizedWithPort === normalizeHostWithPort(candidate)) {
        return toCompatibilityAlias(config);
      }
    }

    if (isLocalNipIoAlias(normalized, config.label)) return toCompatibilityAlias(config);
  }

  return null;
}

export function canonicalHostForTenant(tenantId: TenantId): string {
  return aliasForTenant(tenantId).canonicalHost;
}

export function localHostForTenant(tenantId: TenantId): string {
  return aliasForTenant(tenantId).localHost;
}

export function envHostForTenant(tenantId: TenantId): string | null {
  return envHost(aliasForTenant(tenantId));
}
