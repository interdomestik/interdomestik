export function buildAdminUserProfileHref(memberId: string, searchParams: URLSearchParams): string {
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) {
    return `/admin/users/${memberId}`;
  }

  const nextParams = new URLSearchParams();
  nextParams.set('tenantId', tenantId);
  return `/admin/users/${memberId}?${nextParams.toString()}`;
}
