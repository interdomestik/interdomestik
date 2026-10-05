/**
 * URL, route-family and free-text redaction primitives for Sentry telemetry.
 *
 * Telemetry keeps fixed route families only. Query strings, fragments and opaque path segments
 * (claim, draft, document or member identifiers, signed capabilities, OTP and `next` values) never
 * reach Sentry, so a transaction name stays an aggregation key instead of a data export.
 */

import { LOCALES } from '@/i18n/locales';
import { redactSignedStorageUrls } from './signed-storage-redaction';

const ID_PLACEHOLDER = ':id';
// Only source-owned route words survive. Short alphabetic claim IDs are private too.
const ROUTE_WORDS = new Set([
  ...LOCALES,
  'api',
  'auth',
  'login',
  'logout',
  'sign-in',
  'sign-out',
  'email',
  'get-session',
  'session',
  'register',
  'forgot-password',
  'reset-password',
  'member',
  'agent',
  'staff',
  'admin',
  'claims',
  'claim',
  'drafts',
  'documents',
  'overview',
  'settings',
  'profile',
  'billing',
  'membership',
  'pricing',
  'plans',
  'notifications',
  'messages',
  'evidence',
  'upload',
  'download',
  'users',
  '_next',
  'static',
  'chunks',
  'css',
  'media',
  'storage',
  'v1',
  'object',
  'sign',
]);

export function toRouteFamily(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean).slice(0, 10);
  return (
    '/' +
    segments
      .map(segment => {
        try {
          const decoded = decodeURIComponent(segment).toLowerCase();
          return ROUTE_WORDS.has(decoded) ? decoded : ID_PLACEHOLDER;
        } catch {
          return ID_PLACEHOLDER;
        }
      })
      .join('/')
  );
}

/**
 * Reduces a URL to origin plus route family. Query strings and fragments are always dropped, and a
 * non-HTTP scheme (`data:`, `blob:`, `javascript:`) is reported by scheme only.
 */
export function scrubUrl(value: string): string {
  const signedStorageSafe = redactSignedStorageUrls(value);

  try {
    const url = new URL(signedStorageSafe);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `${url.protocol}[redacted-uri]`;
    }
    return `${url.origin}${toRouteFamily(url.pathname)}`;
  } catch {
    // Not absolute: treat it as a path and drop everything after the path boundary.
  }

  const [pathOnly = ''] = signedStorageSafe.split(/[?#]/);
  return pathOnly.startsWith('/') ? toRouteFamily(pathOnly) : '[redacted]';
}

/** Preserve SDK request grouping: Next names server roots as `METHOD /source/route`. */
export function scrubTransactionName(value: string): string {
  if (value === 'Critical UI action') return value;
  const request = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE) (\/[^\s]*)$/.exec(value);
  if (request && !request[2].startsWith('//')) return `${request[1]} ${scrubUrl(request[2])}`;
  if (/^\/[^\s]*$/.test(value) && !value.startsWith('//')) return scrubUrl(value);
  if (/^https?:\/\/[^\s]+$/.test(value)) return scrubUrl(value);
  return '[redacted]';
}

/** Arbitrary free text is never a diagnostic label. */
export function scrubText(value: string): string {
  return value ? '[redacted]' : '';
}

/** Keep only recognized hashed build assets intact so Sentry can resolve source maps. */
export function scrubStackFilename(value: string): string {
  try {
    const url = new URL(value);
    const asset =
      /^\/_next\/static\/(?:chunks|css)\/(?:(?:webpack|main|framework|polyfills|app|page|layout|error|not-found|\d{1,8})-)?[a-f0-9]{6,64}\.(?:js|mjs|css)$/i;
    if (['http:', 'https:'].includes(url.protocol) && asset.test(url.pathname))
      return `${url.origin}${url.pathname}`;
    return scrubUrl(value);
  } catch {
    // A bare source filename is source-owned code context, not a filesystem or route path.
    return /^[a-zA-Z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs)$/.test(value) ? value : scrubUrl(value);
  }
}
