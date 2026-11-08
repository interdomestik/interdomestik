import { isKnownIdaFrontDoorHost } from '@/lib/tenant/tenant-front-door';
import {
  canonicalHostForTenant,
  envHostForTenant,
  localHostForTenant,
  type TenantId,
} from '@/lib/tenant/tenant-host-aliases';
import { isLocalTenantAppHost } from '@/lib/tenant/tenant-local-hosts';

/**
 * Origins for links the server puts in email: `authOrigin` serves Better Auth (the token half of a
 * reset link) and `appOrigin` is where the member lands. Both must belong to the deployment that
 * issues the link, so a staging or E2E token never points at a production host. Tenant routing is
 * untouched: this only chooses where an emailed link returns.
 */
export type TenantEmailOrigins = Readonly<{ authOrigin: string; appOrigin: string }>;

export type EmailLinkOriginFailure =
  | 'unknown_tenant'
  | 'missing_auth_origin'
  | 'invalid_auth_origin'
  | 'production_origin_outside_production'
  | 'invalid_tenant_host'
  | 'conflicting_tenant_host';

export class EmailLinkOriginError extends Error {
  readonly reason: EmailLinkOriginFailure;

  constructor(reason: EmailLinkOriginFailure) {
    super(`Email link origin unavailable: ${reason}`);
    this.name = 'EmailLinkOriginError';
    this.reason = reason;
  }
}

const TENANT_IDS: readonly TenantId[] = ['tenant_mk', 'tenant_ks', 'tenant_al', 'pilot-mk'];
const PRODUCTION_FRONT_DOOR_HOSTS: readonly string[] = [
  'interdomestik.com',
  'www.interdomestik.com',
  'app.interdomestik.com',
  'ida.interdomestik.com',
];
// Mirrors getAuthBaseURL(); used only by a verified production deployment.
const PRODUCTION_AUTH_FALLBACK = 'https://www.interdomestik.com';
const AUTH_BASE_PATHS = new Set(['/', '/api/auth', '/api/auth/']);
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/u;

/**
 * Deployment identity, not build mode: preview and E2E servers also run NODE_ENV=production.
 * Missing or conflicting signals never mean production.
 */
export function isProductionEmailDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  const targetEnv = process.env.VERCEL_TARGET_ENV?.trim();
  if (vercelEnv || targetEnv) {
    return vercelEnv === 'production' && (!targetEnv || targetEnv === 'production');
  }
  return process.env.INTERDOMESTIK_DEPLOY_ENV?.trim() === 'production';
}

function productionHosts(): Set<string> {
  return new Set([...PRODUCTION_FRONT_DOOR_HOSTS, ...TENANT_IDS.map(canonicalHostForTenant)]);
}

function parseOrigin(raw: string, allowedPaths: ReadonlySet<string>): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (!allowedPaths.has(url.pathname) || !HOST_PATTERN.test(url.host)) return null;
  if (url.protocol === 'https:') return url.origin;
  return url.protocol === 'http:' && isLocalTenantAppHost(url.hostname) ? url.origin : null;
}

function resolveAuthOrigin(production: boolean): string {
  const raw =
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (production ? PRODUCTION_AUTH_FALLBACK : '');
  if (!raw) throw new EmailLinkOriginError('missing_auth_origin');
  const origin = parseOrigin(raw, AUTH_BASE_PATHS);
  if (!origin) throw new EmailLinkOriginError('invalid_auth_origin');
  if (!production && productionHosts().has(new URL(origin).hostname)) {
    throw new EmailLinkOriginError('production_origin_outside_production');
  }
  return origin;
}

function isOtherTenantHost(tenantId: TenantId, url: URL): boolean {
  return TENANT_IDS.some(other => {
    if (other === tenantId) return false;
    const otherEnvHost = envHostForTenant(other)?.trim().toLowerCase();
    return (
      canonicalHostForTenant(other) === url.hostname ||
      localHostForTenant(other) === url.hostname ||
      otherEnvHost === url.host
    );
  });
}

function explicitTenantOrigin(
  tenantId: TenantId,
  authOrigin: string,
  production: boolean
): string | null {
  const configured = envHostForTenant(tenantId)?.trim().toLowerCase();
  if (!configured) return null;
  const scheme = isLocalTenantAppHost(configured) ? 'http' : 'https';
  const origin = HOST_PATTERN.test(configured)
    ? parseOrigin(`${scheme}://${configured}`, new Set(['/']))
    : null;
  if (!origin || (production && scheme === 'http')) {
    throw new EmailLinkOriginError('invalid_tenant_host');
  }
  const url = new URL(origin);
  if (!production && productionHosts().has(url.hostname)) {
    throw new EmailLinkOriginError('production_origin_outside_production');
  }
  // A tenant host is never the shared front door nor another tenant's host.
  if (
    url.host === new URL(authOrigin).host ||
    isKnownIdaFrontDoorHost(url.hostname) ||
    isOtherTenantHost(tenantId, url)
  ) {
    throw new EmailLinkOriginError('conflicting_tenant_host');
  }
  return origin;
}

/**
 * An explicit tenant host wins; a verified production deployment otherwise uses the tenant's
 * canonical host; every other deployment returns members to its own auth origin. Throws a
 * content-free EmailLinkOriginError instead of guessing.
 */
export function resolveTenantEmailOrigins(tenantId: TenantId): TenantEmailOrigins {
  const production = isProductionEmailDeployment();
  const authOrigin = resolveAuthOrigin(production);
  const explicit = explicitTenantOrigin(tenantId, authOrigin, production);
  const appOrigin =
    explicit ?? (production ? `https://${canonicalHostForTenant(tenantId)}` : authOrigin);
  return Object.freeze({ authOrigin, appOrigin });
}
