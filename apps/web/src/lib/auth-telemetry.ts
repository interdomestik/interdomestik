export type AuthTelemetryEventName =
  | 'staff_post_login_redirect_failed'
  | 'protected_route_bounce_to_login'
  | 'session_introspection_throttled'
  | 'session_probe_skipped_after_ready';

export type AuthTelemetryReason =
  | 'missing_cookie'
  | 'invalid_cookie'
  | 'inactive_session'
  | 'throttled'
  | 'post_login_sync_timeout'
  | 'unsupported_redirect_target'
  | 'ready_probe_skipped';

export type AuthTelemetrySurface = 'staff' | 'member' | 'admin' | 'agent' | 'unknown';
export type AuthTelemetryHostClass = 'nipio' | 'canonical' | 'localhost' | 'other';

export type AuthTelemetryPayload = {
  event_type: 'auth_telemetry';
  event_name: AuthTelemetryEventName;
  occurred_at: string;
  tenant: string;
  locale: string;
  surface: AuthTelemetrySurface;
  host_class: AuthTelemetryHostClass;
  reason: AuthTelemetryReason;
  pathname_family: string;
};

export type AuthTelemetryInput = {
  eventName: AuthTelemetryEventName;
  tenant?: string | null;
  locale?: string | null;
  surface?: AuthTelemetrySurface | string | null;
  host?: string | null;
  pathname?: string | null;
  reason: AuthTelemetryReason;
  occurredAt?: string | Date | number | null;
};

const SUPPORTED_LOCALES = new Set(['sq', 'en', 'sr', 'mk']);

function normalizeScalar(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeTenant(tenant: string | null | undefined): string {
  return normalizeScalar(tenant?.toLowerCase() ?? null, 'tenant_unknown');
}

function normalizeLocale(locale: string | null | undefined): string {
  return normalizeScalar(locale?.toLowerCase() ?? null, 'unknown');
}

function normalizeSurface(surface: AuthTelemetryInput['surface']): AuthTelemetrySurface {
  const normalized = normalizeScalar(
    typeof surface === 'string' ? surface.toLowerCase() : null,
    'unknown'
  );

  if (
    normalized === 'staff' ||
    normalized === 'member' ||
    normalized === 'admin' ||
    normalized === 'agent'
  ) {
    return normalized;
  }

  return 'unknown';
}

function normalizeHostClass(host: string | null | undefined): AuthTelemetryHostClass {
  const normalized = normalizeScalar(host?.toLowerCase() ?? null, '');

  if (!normalized) return 'other';
  if (normalized.includes('nip.io')) return 'nipio';
  if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) return 'localhost';
  if (normalized === 'interdomestik.com' || normalized.endsWith('.interdomestik.com')) {
    return 'canonical';
  }

  return 'other';
}

function normalizeOccurredAt(occurredAt: AuthTelemetryInput['occurredAt']): string {
  if (occurredAt instanceof Date) {
    return occurredAt.toISOString();
  }

  if (typeof occurredAt === 'number') {
    return new Date(occurredAt).toISOString();
  }

  if (typeof occurredAt === 'string' && occurredAt.trim()) {
    const parsed = new Date(occurredAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function extractPathname(pathname: string): string {
  try {
    return new URL(pathname, 'http://auth-telemetry.local').pathname;
  } catch {
    return pathname;
  }
}

export function normalizeAuthPathnameFamily(pathname: string): string {
  const extractedPathname = extractPathname(pathname).trim();
  if (!extractedPathname) return '/';

  const segments = extractedPathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  const [firstSegment, ...rest] = segments;
  const routeSegments = SUPPORTED_LOCALES.has(firstSegment.toLowerCase()) ? rest : segments;
  if (routeSegments.length === 0) return '/';

  return `/${routeSegments
    .slice(0, 2)
    .map(segment => segment.toLowerCase())
    .join('/')}`;
}

export function normalizeAuthTelemetryPayload(input: AuthTelemetryInput): AuthTelemetryPayload {
  return {
    event_type: 'auth_telemetry',
    event_name: input.eventName,
    occurred_at: normalizeOccurredAt(input.occurredAt),
    tenant: normalizeTenant(input.tenant),
    locale: normalizeLocale(input.locale),
    surface: normalizeSurface(input.surface),
    host_class: normalizeHostClass(input.host),
    reason: input.reason,
    pathname_family: normalizeAuthPathnameFamily(input.pathname ?? '/'),
  };
}

export function emitAuthTelemetryEvent(input: AuthTelemetryInput): AuthTelemetryPayload {
  const payload = normalizeAuthTelemetryPayload(input);
  console.info(JSON.stringify(payload));
  return payload;
}
