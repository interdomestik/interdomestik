import {
  coerceTenantId,
  hasHostSessionTenantMismatch,
  resolveTenantContextFromSources,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantId,
  type TenantResolutionOptions,
  type TenantResolutionSource,
} from './tenant-hosts';

type RequestLike = {
  headers: Headers;
  url: string;
};

type SessionLike = {
  user?: {
    legalTenantId?: string | null;
    tenantId?: string | null;
  } | null;
} | null;

type TenantContextBase = {
  host_id: TenantId | null;
  booking_tenant_id: TenantId;
  source: TenantResolutionSource;
};

export type TenantContextResolution =
  | (TenantContextBase & {
      status: 'resolved';
      access_tenant_id: TenantId;
      legal_tenant_id: TenantId;
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
  session: SessionLike,
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
  const bookingTenantId = requestContext.defaultBookingTenantId ?? requestContext.tenantId;
  const accessTenantId = coerceTenantId(session?.user?.tenantId);
  const base = {
    host_id: hostId,
    booking_tenant_id: bookingTenantId,
    source: requestContext.source,
  };

  if (!accessTenantId) {
    return {
      ...base,
      status: 'missing_session_tenant',
      access_tenant_id: null,
      legal_tenant_id: null,
    };
  }

  const legalTenantId = coerceTenantId(session?.user?.legalTenantId) ?? accessTenantId;
  if (hasHostSessionTenantMismatch(hostId, accessTenantId) || accessTenantId !== bookingTenantId) {
    return {
      ...base,
      status: 'tenant_mismatch',
      access_tenant_id: accessTenantId,
      legal_tenant_id: legalTenantId,
    };
  }

  return {
    ...base,
    status: 'resolved',
    access_tenant_id: accessTenantId,
    legal_tenant_id: legalTenantId,
  };
}
