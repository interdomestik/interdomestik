import type { ClaimOpsDetail } from '../../types';

export type ClaimHeaderProps = Readonly<{
  claim: ClaimOpsDetail;
  allStaff: { id: string; name: string | null; email: string }[];
  locale: string;
  deploymentOrigin: string;
}>;

export function buildAdminUserProfileHref(memberId: string, searchParams: URLSearchParams): string {
  void searchParams;
  return `/admin/users/${memberId}`;
}

export function resolveRouteLocale(pathname: string | null, fallbackLocale: string): string {
  const routeLocale = pathname?.split('/')[1];
  if (routeLocale && ['en', 'sq', 'mk', 'sr', 'de'].includes(routeLocale)) {
    return routeLocale;
  }

  return fallbackLocale;
}
