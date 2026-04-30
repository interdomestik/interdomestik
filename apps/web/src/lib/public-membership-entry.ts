export const PUBLIC_MEMBERSHIP_ENTRY_HREF = '/pricing';
export const PUBLIC_FREE_START_ANCHOR_HREF = '#free-start-intake';
export const PUBLIC_FREE_START_ENTRY_HREF = `/${PUBLIC_FREE_START_ANCHOR_HREF}`;

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
