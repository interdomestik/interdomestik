import { isAdmin } from '@/lib/roles.core';
import {
  readSavedDraftContinuation,
  savedDraftContinuationHref,
} from '@/lib/saved-draft-continuation';

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

export function resolveSafeNextPath(
  nextPath: string | null,
  role: string,
  locale: string,
  hash = ''
): string | null {
  const draftId = readSavedDraftContinuation(hash);
  nextPath = nextPath ?? (draftId ? savedDraftContinuationHref(locale, draftId) : null);
  if (!nextPath) {
    return null;
  }

  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return null;
  }

  const allowedPrefix = getAllowedSurfacePrefix(role, locale);
  if (!allowedPrefix) {
    return null;
  }

  return nextPath === allowedPrefix || nextPath.startsWith(`${allowedPrefix}/`) ? nextPath : null;
}
