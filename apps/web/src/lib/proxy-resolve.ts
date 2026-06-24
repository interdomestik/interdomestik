import { routing } from '@/i18n/routing';
import { resolveTenantHostContext } from '@/lib/tenant/tenant-front-door';
import type { NextRequest } from 'next/server';

// URL path segments, not RBAC role names. These preserve the canonical route contract.
const PROTECTED_TOP_LEVEL: ReadonlySet<string> = new Set<string>()
  .add('member')
  .add('admin')
  .add('staff')
  .add('agent');

export type ProxySurface = 'staff' | 'member' | 'admin' | 'agent' | 'unknown';

export type ProxyRequestContext = {
  host: string;
  isLocale: boolean;
  isProtected: boolean;
  locale: string;
  localeCandidate: string;
  surface: ProxySurface;
  tenant: string | null;
  tenantContext: ReturnType<typeof resolveTenantHostContext>;
  topLevel: string | undefined;
};

function getTelemetrySurface(topLevel: string | undefined): ProxySurface {
  return topLevel && PROTECTED_TOP_LEVEL.has(topLevel) ? (topLevel as ProxySurface) : 'unknown';
}

export function resolveProxyRequestContext(request: NextRequest): ProxyRequestContext {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') ?? '';
  const tenantContext = resolveTenantHostContext(host);
  const segments = pathname.split('/');
  const possibleLocale = segments[1];
  const isLocale = routing.locales.includes(possibleLocale as (typeof routing.locales)[number]);
  const topLevel = isLocale ? segments[2] : segments[1];

  return {
    host,
    isLocale,
    isProtected: PROTECTED_TOP_LEVEL.has(topLevel),
    locale: isLocale ? possibleLocale : 'sq',
    localeCandidate: possibleLocale,
    surface: getTelemetrySurface(topLevel),
    tenant: tenantContext.tenantId,
    tenantContext,
    topLevel,
  };
}
