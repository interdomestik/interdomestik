'use client';

import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { buildDashboardNavigationModel } from '@/hooks/use-dashboard-navigation';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ClientShellUser } from './client-shell-user';
import { RoleShell } from './role-shell';
import { useDashboardShellSlots } from './dashboard-shell-slots';

const DIASPORA_LOCALE_QUERY_KEYS = ['country', 'origin', 'destination', 'transit'] as const;

export function MemberRoleShell({
  children,
  user,
}: Readonly<{ children: ReactNode; user: ClientShellUser }>): ReactNode {
  const t = useTranslations('nav');
  const tBottom = useTranslations('dashboard.member_assistance.bottomNav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const slots = useDashboardShellSlots(user);
  const { memberItems } = buildDashboardNavigationModel({ t, role: user.role, adminAccess: false });
  const primaryItems = memberItems
    .filter(item => item.mobileOrder !== undefined)
    .sort((a, b) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0));

  return (
    <RoleShell
      {...slots}
      items={memberItems}
      primaryItems={primaryItems}
      pathname={pathname}
      labels={{
        navigation: tBottom('label'),
        more: tBottom('more'),
        close: tCommon('cancel'),
        menu: t('menu'),
        toggleSidebar: t('toggleSidebar'),
      }}
      sidebarAccount={
        <SidebarUserMenu
          user={user}
          retainedLocaleQueryKeys={
            pathname === '/member/diaspora' ? DIASPORA_LOCALE_QUERY_KEYS : undefined
          }
        />
      }
    >
      {children}
    </RoleShell>
  );
}
