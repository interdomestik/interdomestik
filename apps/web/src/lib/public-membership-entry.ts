export const PUBLIC_MEMBERSHIP_ENTRY_HREF = '/pricing';

export function getPublicMembershipEntryHref(planId?: string | null): string {
  if (!planId) {
    return PUBLIC_MEMBERSHIP_ENTRY_HREF;
  }

  const params = new URLSearchParams();
  params.set('plan', planId);
  return `${PUBLIC_MEMBERSHIP_ENTRY_HREF}?${params.toString()}`;
}

export function isPublicMembershipEntryHref(href: string): boolean {
  return (
    href === PUBLIC_MEMBERSHIP_ENTRY_HREF || href.startsWith(`${PUBLIC_MEMBERSHIP_ENTRY_HREF}?`)
  );
}
