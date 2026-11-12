// Exact deployment origins from .github/workflows/cd.yml. No tenant subdomains.
const APP_ORIGINS = new Set(['https://www.interdomestik.com', 'https://staging.interdomestik.com']);

/** The redaction marker must survive the SDK's second sanitization pass. */
export function parseTelemetryUrl(value: string): URL {
  return new URL(value.replace(/^(https?:\/\/)\[redacted-host\](?=\/|$)/, '$1redacted.invalid'));
}

export function safeTelemetryOrigin(url: URL): string {
  if (APP_ORIGINS.has(url.origin)) return url.origin;
  try {
    // This build-time public configuration is trusted; never infer trust from a
    // request host, browser location, tenant domain or wildcard suffix.
    const app = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '');
    if (
      ['http:', 'https:'].includes(app.protocol) &&
      !app.username &&
      !app.password &&
      !app.search &&
      !app.hash &&
      app.pathname === '/' &&
      app.origin === url.origin
    )
      return url.origin;
  } catch {
    // Missing/malformed configuration grants no additional origin.
  }
  return `${url.protocol}//[redacted-host]`;
}
