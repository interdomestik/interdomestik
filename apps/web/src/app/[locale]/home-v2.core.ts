import {
  getCanonicalRouteForRole,
  stripLocalePrefixFromCanonicalRoute,
} from '@/lib/canonical-routes';

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
    return '/register';
  }

  if (session.role === 'member' || session.role === 'user') {
    return '/member/claims/new';
  }

  const canonical = getCanonicalRouteForRole(session.role ?? null, locale);
  return stripLocalePrefixFromCanonicalRoute(canonical, locale) ?? '/register';
}
