import {
  canonicalHostForTenant,
  envHostForTenant,
  localHostForTenant,
  resolveCountryHostCompatibilityAlias,
  type TenantId,
} from './tenant-host-aliases';
import { isKnownIdaFrontDoorHost } from './tenant-front-door';
import { isLocalDevelopmentHost } from './local-development-host';
import type { TenantResolutionResult } from './tenant-resolution-types';

export type { TenantId } from './tenant-host-aliases';
export type { TenantResolutionResult, TenantResolutionSource } from './tenant-resolution-types';
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
  allowLoopbackFallback?: boolean;
};

export function resolveDefaultPublicTenantId(): TenantId {
  return coerceTenantId(process.env.DEFAULT_PUBLIC_TENANT_ID) ?? 'tenant_ks';
}

function normalizeHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  const withoutPort = raw.replace(/:\d+$/, '');
  return withoutPort.toLowerCase().replace(/\.$/, '');
}

function isTenantId(value: string | null | undefined): value is TenantId {
  return (
    value === 'tenant_mk' || value === 'tenant_ks' || value === 'tenant_al' || value === 'pilot-mk'
  );
}

export function resolveTenantFromHost(host: string): TenantId | null {
  return resolveCountryHostCompatibilityAlias(host)?.tenantId ?? null;
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
  const useHttp = isLocalDevelopmentHost(host);
  return `${useHttp ? 'http' : 'https'}://${host}`;
}

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function isLoopbackHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host ?? '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

const publicContext = (): TenantResolutionResult => ({
  kind: 'public',
  tenantId: null,
  source: 'ida_front_door',
});

export function resolveTenantIdFromSources(
  sources: TenantResolutionSources,
  options: TenantResolutionOptions = {}
): TenantId {
  const context = resolveTenantContextFromSources(sources, options);
  return context.kind === 'tenant' ? context.tenantId : resolveDefaultPublicTenantId();
}

export function resolveTenantContextFromSources(
  sources: TenantResolutionSources,
  options: TenantResolutionOptions = {}
): TenantResolutionResult {
  const hostAlias = resolveCountryHostCompatibilityAlias(sources.host ?? '');
  if (hostAlias) {
    return {
      kind: 'tenant',
      tenantId: hostAlias.tenantId,
      source: 'compatibility_alias',
      defaultBookingTenantId: hostAlias.defaultBookingTenantId,
      hostAlias: hostAlias.label,
    };
  }

  if (isKnownIdaFrontDoorHost(sources.host)) return publicContext();

  const productionSensitive = options.productionSensitive ?? true;
  const isLocalLoopbackFallbackAllowed =
    options.allowLoopbackFallback === true && isLoopbackHost(sources.host);
  const allowUserControlledFallback =
    isLocalLoopbackFallbackAllowed || !(productionSensitive && isProductionLikeEnvironment());
  if (allowUserControlledFallback) {
    const cookieTenant = coerceTenantId(sources.cookieTenantId);
    if (cookieTenant) return { kind: 'tenant', tenantId: cookieTenant, source: 'cookie' };

    const headerTenant = coerceTenantId(sources.headerTenantId);
    if (headerTenant) return { kind: 'tenant', tenantId: headerTenant, source: 'header' };

    const queryTenant = coerceTenantId(sources.queryTenantId);
    if (queryTenant) return { kind: 'tenant', tenantId: queryTenant, source: 'query' };
  }

  return { kind: 'tenant', tenantId: resolveDefaultPublicTenantId(), source: 'default_public' };
}

export function hasHostSessionTenantMismatch(
  hostTenantId: TenantId | null,
  sessionTenantId: string | null | undefined
): boolean {
  if (!hostTenantId) return false;
  const normalizedSessionTenantId = coerceTenantId(sessionTenantId ?? undefined);
  return normalizedSessionTenantId !== null && normalizedSessionTenantId !== hostTenantId;
}
