'use client';

import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { buildStaffNavigation } from '@/components/staff/staff-navigation';
import { StaffSidebarBrand } from '@/components/staff/staff-sidebar';
import { usePathname } from '@/i18n/routing';
import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ClientShellUser } from './client-shell-user';
import { useDashboardShellSlots } from './dashboard-shell-slots';
import { RoleShell } from './role-shell';
import styles from './role-workspace.module.css';

export function StaffRoleShell({
  children,
  user,
  adminAccess,
}: Readonly<{ children: ReactNode; user: ClientShellUser; adminAccess: boolean }>): ReactNode {
  const tNav = useTranslations('nav');
  const tClaims = useTranslations('agent-claims.claims');
  const tBottom = useTranslations('dashboard.member_assistance.bottomNav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const slots = useDashboardShellSlots(user, adminAccess);
  const destinations = buildStaffNavigation({ role: user.role, tNav, tClaims });
  const items = [
    ...destinations,
    { title: tNav('settings'), href: '/staff/settings', icon: Settings },
  ];

  return (
    <div className={styles.workspace}>
      <RoleShell
        {...slots}
        brand={<StaffSidebarBrand />}
        items={items}
        primaryItems={destinations.slice(0, 2)}
        pathname={pathname}
        labels={{
          navigation: tNav('staffPortal'),
          more: tBottom('more'),
          close: tCommon('cancel'),
          menu: tNav('menu'),
          toggleSidebar: tNav('toggleSidebar'),
        }}
        sidebarAccount={<SidebarUserMenu user={user} />}
      >
        <div className={styles.content}>{children}</div>
      </RoleShell>
    </div>
  );
}
