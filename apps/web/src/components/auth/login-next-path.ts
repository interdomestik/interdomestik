import { isAdmin } from '@/lib/roles.core';
import {
  readSavedDraftContinuation,
  savedDraftContinuationHref,
} from '@/lib/saved-draft-continuation';

// Raw candidates may not carry control characters, whitespace or backslashes; a browser encodes
// anything legitimate, so these only appear in crafted continuation targets.
const UNSAFE_PATH_CHARS = /[\u0000- \u007f\\]/;
const PLACEHOLDER_ORIGIN = 'https://internal.invalid';

export type InternalContinuationPath = {
  /** Normalized pathname, safe to compare against a role surface prefix. */
  pathname: string;
  /** Normalized pathname with its preserved query and fragment continuation. */
  target: string;
};

function getAllowedSurfacePrefix(role: string, locale: string): string | null {
  if (role === 'agent') {
    return `/${locale}/agent`;
  }

  if (role === 'staff') {
    return `/${locale}/staff`;
  }

  if (isAdmin(role)) {
    return `/${locale}/admin`;
  }

  if (role === 'member' || role === 'user') {
    return `/${locale}/member`;
  }

  return null;
}

/**
 * Normalizes a same-origin continuation path, rejecting protocol-relative, external, malformed,
 * control-character, backslash and percent-encoded-separator inputs. Traversal is normalized by
 * URL parsing, so the returned pathname is what a caller must authorize.
 */
export function sanitizeInternalContinuationPath(
  candidate: string | null = ''
): InternalContinuationPath | null {
  if (candidate === null) return null;
  const value = candidate;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (UNSAFE_PATH_CHARS.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  // An encoded pathname can smuggle a separator or traversal segment past the surface prefix
  // check, and no supported surface needs one.
  if (decodedPathname !== url.pathname) return null;
  if (url.pathname.split('/').some(segment => segment === '.' || segment === '..')) return null;

  return { pathname: url.pathname, target: `${url.pathname}${url.search}${url.hash}` };
}

export function resolveSafeNextPath(
  nextPath: string | null,
  role: string,
  locale: string,
  hash = ''
): string | null {
  const draftId = readSavedDraftContinuation(hash);
  const candidate = nextPath ?? (draftId ? savedDraftContinuationHref(locale, draftId) : null);
  if (!candidate) {
    return null;
  }

  const allowedPrefix = getAllowedSurfacePrefix(role, locale);
  if (!allowedPrefix) {
    return null;
  }

  const internal = sanitizeInternalContinuationPath(candidate);
  if (!internal) {
    return null;
  }

  return internal.pathname === allowedPrefix || internal.pathname.startsWith(`${allowedPrefix}/`)
    ? internal.target
    : null;
}
