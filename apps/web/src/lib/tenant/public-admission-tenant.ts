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

export function resolvePublicAdmissionTenant(
  requestHeaders: Pick<Headers, 'get'>,
  env: Readonly<Record<string, string | undefined>> = process.env
): TenantId | null {
  const authority = requestHeaders.get('host')?.toLowerCase();
  if (!authority) return null;

  const forwarded = requestHeaders.get('x-forwarded-host');
  if (forwarded !== null && forwarded.toLowerCase() !== authority) return null;

  // Strip only a port. The exact ingress table rejects URLs, suffixes and combined headers.
  const host = authority.replace(/:\d+$/, '');
  const release = releaseClass(env);
  const ingress =
    release === 'production'
      ? hostedAuthHosts('production').includes(host)
        ? 'door'
        : null
      : (release === 'staging' ? STAGING_INGRESS : LOCAL_INGRESS).get(host);

  return ingress === 'door' ? coerceTenantId(env.DEFAULT_PUBLIC_TENANT_ID) : (ingress ?? null);
}
