import { getCanonicalRouteForRole } from '@/lib/canonical-routes';

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
    return `/${locale}/register`;
  }

  if (session.role === 'member' || session.role === 'user') {
    return `/${locale}/member/claims/new`;
  }

  return getCanonicalRouteForRole(session.role ?? null, locale) ?? `/${locale}/register`;
}
