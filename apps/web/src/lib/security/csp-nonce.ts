export type CspNonceMode = 'off' | 'report';

const PHASE_0_ENFORCE_MESSAGE =
  'CSP_NONCE_MODE=enforce is not supported in Phase 0; use Phase 1 once Report-Only observation is complete.';

const INVALID_MODE_MESSAGE =
  'Invalid CSP_NONCE_MODE value. Expected "off", "report", or "enforce".';

function parseCspNonceMode(rawMode = process.env.CSP_NONCE_MODE): CspNonceMode {
  if (rawMode === undefined) return 'off';

  if (rawMode === 'enforce') {
    throw new Error(PHASE_0_ENFORCE_MESSAGE);
  }

  if (rawMode === 'off' || rawMode === 'report') {
    return rawMode;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(INVALID_MODE_MESSAGE);
  }

  console.warn(`${INVALID_MODE_MESSAGE} Falling back to "off" outside production.`);
  return 'off';
}

export const CSP_NONCE_MODE = parseCspNonceMode();

export function isCspNonceActive(): boolean {
  return CSP_NONCE_MODE === 'report';
}

export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (nonce.endsWith('==')) {
    return nonce.slice(0, -2);
  }

  if (nonce.endsWith('=')) {
    return nonce.slice(0, -1);
  }

  return nonce;
}

export function buildReportToHeader(): string {
  return JSON.stringify({
    group: 'csp-endpoint',
    max_age: 86400,
    endpoints: [{ url: '/api/csp-report' }],
  });
}

export function buildReportOnlyCsp(params: { nonce: string; isProductionHttps: boolean }): string {
  const { nonce, isProductionHttps } = params;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: ${isDevelopment ? "'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://api.paddle.com https://*.paddle.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://graph.facebook.com",
    "frame-src 'self' https://*.paddle.com https://buy.paddle.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
    isProductionHttps ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean);

  return directives
    .join('; ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
