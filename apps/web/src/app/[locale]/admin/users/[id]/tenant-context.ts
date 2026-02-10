export function buildTenantAwareUserProfilePath(params: {
  locale: string;
  userId: string;
  searchParams: Record<string, string | string[] | undefined>;
  tenantId: string;
}): string {
  const { locale, userId, searchParams, tenantId } = params;
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        next.append(key, item);
      }
      continue;
    }
    next.set(key, value);
  }

  next.set('tenantId', tenantId);
  return `/${locale}/admin/users/${userId}?${next.toString()}`;
}

export function hasTenantContext(
  searchParams: Record<string, string | string[] | undefined>
): boolean {
  const raw = searchParams.tenantId;
  if (Array.isArray(raw)) {
    return raw.some(Boolean);
  }
  return Boolean(raw);
}
