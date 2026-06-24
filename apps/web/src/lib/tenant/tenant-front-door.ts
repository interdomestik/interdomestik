import {
  resolveCountryHostCompatibilityAlias,
  type CountryHostAliasLabel,
  type TenantId,
} from './tenant-host-aliases';

const DEFAULT_IDA_FRONT_DOOR_HOSTS = new Set([
  'ida.interdomestik.com',
  'ida.localhost',
  'ida.127.0.0.1.nip.io',
]);

export type TenantHostContext =
  | {
      kind: 'compatibility_alias';
      tenantId: TenantId;
      source: 'country_host_alias';
      defaultBookingTenantId: TenantId;
      hostAlias: CountryHostAliasLabel;
    }
  | { kind: 'public'; tenantId: null; source: 'ida_front_door' }
  | { kind: 'unknown'; tenantId: null; source: 'unknown_host' };

export function normalizeTenantHost(host: string | null | undefined): string {
  const raw = host?.split(',')[0]?.trim() ?? '';
  let authority = raw.toLowerCase();

  if (authority.startsWith('http://')) {
    authority = authority.slice('http://'.length);
  } else if (authority.startsWith('https://')) {
    authority = authority.slice('https://'.length);
  }

  const pathStart = authority.indexOf('/');
  if (pathStart >= 0) {
    authority = authority.slice(0, pathStart);
  }

  const portStart = authority.lastIndexOf(':');
  const port = authority.slice(portStart + 1);
  if (portStart >= 0 && port.length > 0 && [...port].every(char => char >= '0' && char <= '9')) {
    authority = authority.slice(0, portStart);
  }

  return authority.endsWith('.') ? authority.slice(0, -1) : authority;
}

export function isKnownIdaFrontDoorHost(host: string | null | undefined): boolean {
  const normalized = normalizeTenantHost(host);
  const configuredIdaHost = normalizeTenantHost(process.env.IDA_HOST);

  return (
    normalized.startsWith('ida.') ||
    DEFAULT_IDA_FRONT_DOOR_HOSTS.has(normalized) ||
    (configuredIdaHost.length > 0 && normalized === configuredIdaHost)
  );
}

export function resolveTenantHostContext(host: string): TenantHostContext {
  const alias = resolveCountryHostCompatibilityAlias(host);
  if (alias) {
    return {
      kind: 'compatibility_alias',
      tenantId: alias.tenantId,
      source: 'country_host_alias',
      defaultBookingTenantId: alias.defaultBookingTenantId,
      hostAlias: alias.label,
    };
  }

  if (isKnownIdaFrontDoorHost(host)) {
    return { kind: 'public', tenantId: null, source: 'ida_front_door' };
  }

  return { kind: 'unknown', tenantId: null, source: 'unknown_host' };
}
