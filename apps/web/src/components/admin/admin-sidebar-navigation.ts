'use client';

import type { ShellNavigationItem } from '@/components/shell/shell-navigation';
import type { AdminNavigationCapabilities } from '@/features/admin/access/admin-capabilities';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { adminSidebarItems } from './admin-sidebar-items';
import { withAdminContext } from './admin-sidebar-context';

export type AdminSidebarUser = Readonly<{
  capabilities: AdminNavigationCapabilities;
  branchId?: string | null;
  name: string;
  email: string;
  role: string;
}>;

/** Existing admin sidebar decisions, including branch admission and query-sensitive people. */
export function useAdminSidebarNavigation(user: AdminSidebarUser): ShellNavigationItem[] {
  const t = useTranslations('admin.sidebar');
  const tNav = useTranslations('nav');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role');
  let peopleRole = 'members';
  if (roleParam?.includes('agent')) {
    peopleRole = 'agents';
  } else if (roleParam?.includes('staff') || roleParam?.includes('admin')) {
    peopleRole = 'staff';
  }

  return adminSidebarItems(user.role, user.branchId, user.capabilities).map(item => ({
    href: withAdminContext(item.href, searchParams),
    title: item.title === 'sponsors' ? tNav('sponsors') : t(item.title),
    icon: item.icon,
    prefetch: item.peopleKey === 'members' || item.peopleKey === 'agents' || undefined,
    selected:
      item.peopleKey === undefined
        ? undefined
        : (pathname === '/admin/users' || pathname.startsWith('/admin/users/')) &&
          peopleRole === item.peopleKey,
  }));
}
