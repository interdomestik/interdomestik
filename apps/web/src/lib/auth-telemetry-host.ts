import { resolveEntryHostId } from './tenant/host-id';
import { normalizeTenantHost } from './tenant/tenant-front-door';

export type AuthTelemetryHostClass = 'nipio' | 'canonical' | 'localhost' | 'other';

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function normalizeAuthTelemetryHostClass(
  host: string | null | undefined
): AuthTelemetryHostClass {
  const value = normalizeTenantHost(host);
  if (!value) return 'other';
  if (value === 'nip.io' || value.endsWith('.nip.io')) return 'nipio';
  if (value === 'localhost' || value === '127.0.0.1') return 'localhost';
  if (value === 'interdomestik.com' || value.endsWith('.interdomestik.com')) return 'canonical';
  return 'other';
}

export function normalizeAuthTelemetryHostId(
  host: string | null | undefined,
  hostId: string | null | undefined
): string {
  return normalized(hostId ?? resolveEntryHostId(host)) || 'host_unknown';
}
