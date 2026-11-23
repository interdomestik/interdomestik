import { getAuthBaseURL, getTrustedOrigins } from './auth/utils';

const ORIGIN_ONLY = /^https?:\/\/[^/?#@\\\s]+$/u;

function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

function httpOrigin(value: string): string | undefined {
  const url = URL.parse(value);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return undefined;
  if (url.username || url.password) return undefined;
  return url.origin;
}

export function sessionRouteOrigins(): ReadonlySet<string> {
  const base = getAuthBaseURL();
  const trusted = getTrustedOrigins() ?? [];
  if (typeof base !== 'string') {
    return new Set([...base.allowedHosts.map(host => `https://${host}`), ...trusted]);
  }

  const origins = new Set<string>();
  const baseOrigin = httpOrigin(base);
  if (baseOrigin) origins.add(baseOrigin);
  for (const entry of trusted) {
    const value = withoutTrailingSlashes(entry);
    if (!ORIGIN_ONLY.test(value)) continue;
    const origin = httpOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}
