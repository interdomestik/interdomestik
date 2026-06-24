import { resolveTenantHostContext } from './tenant-front-door';
import type { TenantId } from './tenant-host-aliases';

export function resolveEntryHostId(host: string | null | undefined): TenantId | null {
  const context = resolveTenantHostContext(host ?? '');
  return context.kind === 'compatibility_alias' ? context.tenantId : null;
}

export function resolveEntryHostIdFromHeaders(
  headers: Headers | null | undefined,
  options: { trustForwardedHost?: boolean } = {}
): TenantId | null {
  if (!headers) return null;
  const host =
    options.trustForwardedHost === true
      ? (headers.get('x-forwarded-host') ?? headers.get('host'))
      : headers.get('host');
  return resolveEntryHostId(host);
}
