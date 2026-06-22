export function buildUpstashRedisPingUrl(rawBaseUrl: string | undefined): URL | null {
  if (!rawBaseUrl) return null;

  const parsed = new URL(rawBaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Invalid Upstash Redis REST URL');
  }
  if (hostname !== 'upstash.io' && !hostname.endsWith('.upstash.io')) {
    throw new Error('Upstash Redis REST URL host is not allowed');
  }

  return new URL('/ping', parsed.origin);
}
