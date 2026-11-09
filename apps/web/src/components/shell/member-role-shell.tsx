'use client';

import { CommandMenuTrigger } from '@/components/dashboard/command-menu-trigger';
import { PortalSurfaceIndicator } from '@/components/dashboard/portal-surface-indicator';
import { SidebarBrand } from '@/components/dashboard/sidebar-brand';
import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { UserNav } from '@/components/dashboard/user-nav';
import { NotificationBell } from '@/components/notifications';
import { buildDashboardNavigationModel } from '@/hooks/use-dashboard-navigation';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ClientShellUser } from './client-shell-user';
import { RoleShell } from './role-shell';

const DIASPORA_LOCALE_QUERY_KEYS = ['country', 'origin', 'destination', 'transit'] as const;

export function MemberRoleShell({
  children,
  user,
}: Readonly<{ children: ReactNode; user: ClientShellUser }>): ReactNode {
  const t = useTranslations('nav');
  const tBottom = useTranslations('dashboard.member_assistance.bottomNav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const { memberItems } = buildDashboardNavigationModel({ t, role: user.role, adminAccess: false });
  const primaryItems = memberItems
    .filter(item => item.mobileOrder !== undefined)
    .sort((a, b) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0));

  return (
    <RoleShell
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
      brand={<SidebarBrand role={user.role} />}
      context={<PortalSurfaceIndicator role={user.role} className="min-w-0 max-w-full flex-wrap" />}
      tools={
        <>
          <div className="min-w-0 max-w-full flex-1 md:flex-none">
            <CommandMenuTrigger />
          </div>
          <NotificationBell subscriberId={user.id} prefetchNotifications={false} />
        </>
      }
      account={
        <fieldset aria-label={t('myAccount')} className="m-0 min-w-0 border-0 p-0">
          <UserNav user={user} adminAccess={false} />
        </fieldset>
      }
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
