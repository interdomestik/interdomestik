export function getRoleRedirect(role: string | null | undefined): '/admin' | '/staff' | null {
  if (role === 'admin' || role === 'super_admin' || role === 'tenant_admin') return '/admin';
  return role === 'staff' || role === 'branch_manager' ? '/staff' : null;
}

// prettier-ignore
export function getDraftManagerHref(available: boolean, resolved: boolean, active: boolean, locale: string): string | null {
  if (!available || !resolved) return null;
  return `/${locale}/member/claims/new${active ? '' : '?mode=drafts'}`;
}
