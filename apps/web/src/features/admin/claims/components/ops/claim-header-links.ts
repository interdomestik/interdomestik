export function buildAdminUserProfileHref(memberId: string, searchParams: URLSearchParams): string {
  void searchParams;
  return `/admin/users/${memberId}`;
}
