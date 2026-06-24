import { isIdaLiveLoginCutoverEnabled } from '@/lib/feature-flags';

import { normalizeTenantHost, resolveTenantHostContext } from './tenant-front-door';

const CANONICAL_IDA_HOST = 'ida.interdomestik.com';

type RedirectTarget = {
  protocol: string;
  host: string;
};

function parseConfiguredIdaHost(): Partial<RedirectTarget> | null {
  const configured = process.env.IDA_HOST?.trim();
  if (!configured) return null;

  try {
    const parsed = new URL(configured.includes('://') ? configured : `https://${configured}`);
    return {
      protocol: configured.includes('://') ? parsed.protocol : undefined,
      host: parsed.host,
    };
  } catch {
    return null;
  }
}

function extractPortSuffix(host: string | null | undefined): string {
  const raw = host?.split(',')[0]?.trim() ?? '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return parsed.port ? `:${parsed.port}` : '';
  } catch {
    return '';
  }
}

function resolveIdaRedirectTarget(
  host: string | null | undefined,
  protocol: string
): RedirectTarget {
  const configured = parseConfiguredIdaHost();
  if (configured?.host) {
    return { protocol: configured.protocol ?? protocol, host: configured.host };
  }

  const normalized = normalizeTenantHost(host);
  const port = extractPortSuffix(host);
  const nipIoMatch = normalized.match(/^[^.]+(\.\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\.nip\.io)$/);

  if (normalized.endsWith('.localhost')) {
    return { protocol, host: `ida.localhost${port}` };
  }

  if (nipIoMatch) {
    return { protocol, host: `ida${nipIoMatch[1]}${port}` };
  }

  return { protocol: 'https:', host: CANONICAL_IDA_HOST };
}

export function isCountryHostLiveLoginBlocked(host: string | null | undefined): boolean {
  return (
    isIdaLiveLoginCutoverEnabled() &&
    resolveTenantHostContext(host ?? '').kind === 'compatibility_alias'
  );
}

export function buildIdaLiveLoginRedirectUrl(
  requestUrl: URL,
  host: string | null | undefined
): URL | null {
  if (!isIdaLiveLoginCutoverEnabled()) return null;

  const context = resolveTenantHostContext(host ?? '');
  if (context.kind !== 'compatibility_alias') return null;

  const target = resolveIdaRedirectTarget(host, requestUrl.protocol);
  const redirectUrl = new URL(`${target.protocol}//${target.host}${requestUrl.pathname}`);
  redirectUrl.search = requestUrl.search;
  redirectUrl.searchParams.set('default_booking_tenant_id', context.defaultBookingTenantId);
  return redirectUrl;
}
