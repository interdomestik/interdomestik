/**
 * Finite diagnostic labels that survive message redaction. Each label is an exact, reviewed
 * spelling from the installed Next, React or Sentry runtime; free text and digests stay private.
 */

// Next control-flow digests (next/dist/.../dynamic-rendering-utils, hooks-server-context,
// lazy-dynamic/bailout-to-csr, http-access-fallback, redirect-error), checked against 16.4.1.
const NEXT_DIGESTS = new Set([
  'HANGING_PROMISE_REJECTION',
  'DYNAMIC_SERVER_USAGE',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
  'NEXT_PRERENDER_INTERRUPTED',
]);
// Prefixed digests carry a status or a redirect target; only the fixed prefix (and a known HTTP
// fallback status) is ever exported, never the target URL.
const NEXT_HTTP_FALLBACK = /^NEXT_HTTP_ERROR_FALLBACK;(401|403|404)$/;
const NEXT_REDIRECT = /^NEXT_REDIRECT;/;
const REACT_MINIFIED = /^Minified React error #(\d{1,4});/;

// Capture mechanisms of the installed @sentry/nextjs 10.x, node-core and browser SDKs.
const MECHANISMS = new Set([
  'generic',
  'auto.function.nextjs.server_component',
  'auto.function.nextjs.server_action',
  'auto.function.nextjs.route_handler',
  'auto.function.nextjs.on_request_error',
  'auto.function.nextjs.generation_function',
  'auto.function.nextjs.page_function',
  'auto.function.nextjs.wrapped',
  'auto.function.nextjs.wrap_middleware',
  'auto.function.nextjs.underscore_error',
  'auto.http.nextjs.api_handler',
  'auto.node.onuncaughtexception',
  'auto.node.onunhandledrejection',
  'auto.browser.global_handlers.onerror',
  'auto.browser.global_handlers.onunhandledrejection',
  'auto.core.linked_errors',
]);

function readStringField(original: unknown, field: 'digest' | 'message'): string | undefined {
  if (!original || typeof original !== 'object' || !(field in original)) return undefined;
  const value = (original as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length <= 512 ? value : undefined;
}

/** Next marks framework control flow with a digest; only reviewed spellings become a label. */
export function safeNextDigest(original: unknown): string | undefined {
  const digest = readStringField(original, 'digest');
  if (!digest) return undefined;
  if (NEXT_DIGESTS.has(digest)) return digest;
  const fallback = NEXT_HTTP_FALLBACK.exec(digest);
  if (fallback) return `NEXT_HTTP_ERROR_FALLBACK;${fallback[1]}`;
  return NEXT_REDIRECT.test(digest) ? 'NEXT_REDIRECT' : undefined;
}

/** Production React replaces messages with a numeric code; the code alone is public. */
export function safeReactErrorCode(original: unknown): string | undefined {
  const message = readStringField(original, 'message');
  const match = message ? REACT_MINIFIED.exec(message) : null;
  return match ? match[1] : undefined;
}

/** Keeps how an error was captured (component wrapper vs real unhandled rejection) diagnosable. */
export function safeMechanismType(type: unknown): string {
  return typeof type === 'string' && MECHANISMS.has(type) ? type : 'generic';
}
