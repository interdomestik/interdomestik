import { hostedAuthHosts } from '@/lib/auth/deployment-hosts';
import { releaseClass } from '@/lib/runtime-environment';
import { coerceTenantId, type TenantId } from './tenant-hosts';

const LOCAL_INGRESS = new Map<string, TenantId | 'door'>([
  ['ida.127.0.0.1.nip.io', 'door'],
  ['ida.localhost', 'door'],
  ['ks.127.0.0.1.nip.io', 'tenant_ks'],
  ['mk.127.0.0.1.nip.io', 'tenant_mk'],
]);

const STAGING_INGRESS = new Map<string, TenantId | 'door'>([
  ['staging.interdomestik.com', 'door'],
  ['ks.staging.interdomestik.com', 'tenant_ks'],
  ['mk.staging.interdomestik.com', 'tenant_mk'],
]);

export function resolvePublicAdmission(
  requestHeaders: Pick<Headers, 'get'>,
  env: Readonly<Record<string, string | undefined>> = process.env
): { kind: 'door' | 'country'; tenantId: TenantId } | null {
  const authority = requestHeaders.get('host')?.toLowerCase();
  if (!authority) {
    return null;
  }

  const forwarded = requestHeaders.get('x-forwarded-host');
  if (forwarded !== null && forwarded.toLowerCase() !== authority) {
    return null;
  }

  // Strip only a port. The exact ingress table rejects URLs, suffixes and combined headers.
  const host = authority.replace(/:\d+$/, '');
  const release = releaseClass(env);
  let ingress: TenantId | 'door' | null | undefined;
  if (release === 'production') {
    if (hostedAuthHosts('production').includes(host)) {
      ingress = 'door';
    }
  } else if (release === 'staging') {
    ingress = STAGING_INGRESS.get(host);
  } else {
    ingress = LOCAL_INGRESS.get(host);
  }

  if (ingress === 'door') {
    const tenantId = coerceTenantId(env.DEFAULT_PUBLIC_TENANT_ID);
    if (!tenantId) {
      return null;
    }
    return { kind: 'door', tenantId };
  }
  if (!ingress) {
    return null;
  }
  return { kind: 'country', tenantId: ingress };
}

export function resolvePublicAdmissionTenant(
  requestHeaders: Pick<Headers, 'get'>,
  env: Readonly<Record<string, string | undefined>> = process.env
): TenantId | null {
  return resolvePublicAdmission(requestHeaders, env)?.tenantId ?? null;
}
