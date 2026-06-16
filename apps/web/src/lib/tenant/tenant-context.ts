import {
  hasHostSessionTenantMismatch,
  resolveTenantContextFromSources,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantId,
  type TenantResolutionOptions,
  type TenantResolutionSource,
} from './tenant-hosts';
import { resolveSessionTenantConcepts, type TenantSessionLike } from './tenant-session-context';

type RequestLike = {
  headers: Headers;
  url: string;
};

type TenantContextBase = {
  host_id: TenantId | null;
  booking_tenant_id: TenantId;
  source: TenantResolutionSource;
};

export type TenantContextResolution =
  | (Omit<TenantContextBase, 'source'> & {
      status: 'resolved';
      access_tenant_id: TenantId;
      legal_tenant_id: TenantId;
      source: TenantResolutionSource | 'session';
    })
  | (TenantContextBase & {
      status: 'missing_session_tenant';
      access_tenant_id: null;
      legal_tenant_id: null;
    })
  | (TenantContextBase & {
      status: 'tenant_mismatch';
      access_tenant_id: TenantId;
      legal_tenant_id: TenantId;
    });

export type ResolveTenantContextOptions = TenantResolutionOptions & {
  tenantIdFromQuery?: string | null;
  /** Enable only after the caller verifies x-forwarded-host comes from a trusted proxy. */
  trustForwardedHost?: boolean;
};

function parseCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(';')) {
    const [rawName, ...rest] = entry.trim().split('=');
    if (rawName !== cookieName) continue;
    const value = rest.join('=').trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function getRequestHost(headers: Headers, trustForwardedHost: boolean): string {
  if (trustForwardedHost) return headers.get('x-forwarded-host') ?? headers.get('host') ?? '';
  return headers.get('host') ?? '';
}

function getQueryTenantId(request: RequestLike, explicitTenantId?: string | null): string | null {
  if (explicitTenantId !== undefined) return explicitTenantId;
  try {
    return new URL(request.url).searchParams.get('tenantId');
  } catch {
    return null;
  }
}

export function resolveTenantContext(
  request: RequestLike,
  session: TenantSessionLike,
  options: ResolveTenantContextOptions = {}
): TenantContextResolution {
  const host = getRequestHost(request.headers, options.trustForwardedHost === true);
  const requestContext = resolveTenantContextFromSources(
    {
      host,
      cookieTenantId: parseCookieValue(request.headers.get('cookie'), TENANT_COOKIE_NAME),
      headerTenantId: request.headers.get(TENANT_HEADER_NAME),
      queryTenantId: getQueryTenantId(request, options.tenantIdFromQuery),
    },
    options
  );
  const hostId = requestContext.source === 'compatibility_alias' ? requestContext.tenantId : null;
  const { accessTenantId, bookingTenantId, legalTenantId } = resolveSessionTenantConcepts(session);
  const requestBookingTenantId = requestContext.defaultBookingTenantId ?? requestContext.tenantId;
  const requestBase = {
    host_id: hostId,
    booking_tenant_id: requestBookingTenantId,
    source: requestContext.source,
  };

  if (!accessTenantId) {
    return {
      ...requestBase,
      status: 'missing_session_tenant',
      access_tenant_id: null,
      legal_tenant_id: null,
    };
  }

  if (hasHostSessionTenantMismatch(hostId, accessTenantId)) {
    return {
      ...requestBase,
      status: 'tenant_mismatch',
      access_tenant_id: accessTenantId,
      legal_tenant_id: legalTenantId ?? accessTenantId,
    };
  }

  return {
    status: 'resolved',
    host_id: hostId,
    booking_tenant_id: bookingTenantId ?? accessTenantId,
    access_tenant_id: accessTenantId,
    legal_tenant_id: legalTenantId ?? accessTenantId,
    source: 'session',
  };
}
