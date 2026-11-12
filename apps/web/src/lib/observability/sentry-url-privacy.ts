/**
 * URL, route-family and free-text redaction primitives for Sentry telemetry.
 *
 * Telemetry keeps fixed route families only. Query strings, fragments and opaque path segments
 * (claim, draft, document or member identifiers, signed capabilities, OTP and `next` values) never
 * reach Sentry, so a transaction name stays an aggregation key instead of a data export.
 */

import { parseTelemetryUrl, safeTelemetryOrigin } from './sentry-origin-privacy';
import { isSafeRoutePattern, toSafeRouteFamily } from './sentry-route-patterns';
import { safeBuildStackFilename } from './sentry-stack-privacy';
import { redactSignedStorageUrls } from './signed-storage-redaction';

const URI_SCHEMES = new Set(['app:', 'node:', 'data:', 'blob:', 'javascript:', 'file:']);

export function toRouteFamily(pathname: string): string {
  return toSafeRouteFamily(pathname);
}

/**
 * Reduces a URL to an approved origin plus route family. Query strings and fragments are dropped; a
 * non-HTTP scheme (`data:`, `blob:`, `javascript:`) is reported by scheme only.
 */
export function scrubUrl(value: string): string {
  const signedStorageSafe = redactSignedStorageUrls(value);

  try {
    const url = parseTelemetryUrl(signedStorageSafe);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return URI_SCHEMES.has(url.protocol) ? `${url.protocol}[redacted-uri]` : '[redacted]';
    }
    return `${safeTelemetryOrigin(url)}${toRouteFamily(url.pathname)}`;
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
  if (request && !request[2].startsWith('//')) {
    const path = scrubTransactionPath(request[2]);
    return path === '[redacted]' ? path : `${request[1]} ${path}`;
  }
  if (/^\/[^\s]*$/.test(value) && !value.startsWith('//')) return scrubTransactionPath(value);
  if (/^https?:\/\/[^\s]+$/.test(value)) return scrubUrl(value);
  return '[redacted]';
}

function scrubTransactionPath(path: string): string {
  const hasPlaceholder = path.split('/').some(segment => /^[\[:]/.test(segment));
  if (!hasPlaceholder) return scrubUrl(path);
  // Mixed patterns/values must match source route shapes, including dynamic positions.
  if (isSafeRoutePattern(path)) return path;
  // The SDK scrubs roots twice. Already-redacted :id families must remain stable.
  return !path.includes('[') && scrubUrl(path) === path ? path : '[redacted]';
}

/** Arbitrary free text is never a diagnostic label. */
export function scrubText(value: string): string {
  return value ? '[redacted]' : '';
}

/** Keep only recognized hashed build assets intact so Sentry can resolve source maps. */
export function scrubStackFilename(value: string): string {
  if (typeof value !== 'string') return '[redacted]';
  // Keep the existing HTTP query/fragment stripping contract; app:/// must match literally.
  const candidate = /^https?:\/\//.test(value) ? value.split(/[?#]/)[0] : value;
  const build = safeBuildStackFilename(candidate);
  if (build) return build;
  return scrubUrl(value);
}
