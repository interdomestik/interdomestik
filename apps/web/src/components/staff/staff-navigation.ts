import type { ShellNavigationItem } from '@/components/shell/shell-navigation';
import { ROLES } from '@interdomestik/shared-auth';
import { BarChart3, FileText, Inbox } from 'lucide-react';

/** The existing staff sidebar decisions, shared with the responsive shell adapter. */
export function buildStaffNavigation({
  role,
  tNav,
  tClaims,
}: Readonly<{
  role?: string | null;
  tNav: (key: string) => string;
  tClaims: (key: string) => string;
}>): readonly ShellNavigationItem[] {
  const queueItems = [
    { title: tClaims('claims_queue'), href: '/staff/claims', icon: FileText },
    { title: tClaims('support_handoffs.nav'), href: '/staff/support-handoffs', icon: Inbox },
  ];
  if (role !== ROLES.staff) return queueItems;
  return [
    ...queueItems,
    { title: tNav('staffCrm'), href: '/staff/crm', icon: BarChart3 },
    { title: tNav('sponsors'), href: '/staff/sponsors', icon: Inbox },
  ];
}
