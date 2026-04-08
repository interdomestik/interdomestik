import {
  getCanonicalRouteForRole,
  stripLocalePrefixFromCanonicalRoute,
} from '@/lib/canonical-routes';
import { PUBLIC_MEMBERSHIP_ENTRY_HREF } from '@/lib/public-membership-entry';

type LandingSession = {
  userId?: string;
  role?: string;
} | null;

export function getStartClaimHrefForSession(params: {
  locale: string;
  session: LandingSession;
}): string {
  const { locale, session } = params;

  if (!session?.userId) {
    return PUBLIC_MEMBERSHIP_ENTRY_HREF;
  }

  if (session.role === 'member' || session.role === 'user') {
    return '/member/claims/new';
  }

  const canonical = getCanonicalRouteForRole(session.role ?? null, locale);
  return stripLocalePrefixFromCanonicalRoute(canonical, locale) ?? PUBLIC_MEMBERSHIP_ENTRY_HREF;
}
