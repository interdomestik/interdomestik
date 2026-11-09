'use client';

import { AdminSidebarBrand } from '@/components/admin/admin-sidebar';
import { AdminSidebarAccount } from '@/components/admin/admin-sidebar-account';
import {
  useAdminSidebarNavigation,
  type AdminSidebarUser,
} from '@/components/admin/admin-sidebar-navigation';
import { PortalSurfaceIndicator } from '@/components/dashboard/portal-surface-indicator';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RoleShell } from './role-shell';
import styles from './role-workspace.module.css';

/** Presentation adapter: the server layout and existing sidebar retain all admission decisions. */
export function AdminRoleShell({
  children,
  user,
  tenantSelector,
}: Readonly<{
  children: ReactNode;
  user: AdminSidebarUser;
  tenantSelector: ReactNode;
}>): ReactNode {
  const t = useTranslations('admin.sidebar');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const items = useAdminSidebarNavigation(user);

  return (
    <div className={styles.workspace}>
      <RoleShell
        mobileNavigation="drawer"
        items={items}
        pathname={pathname}
        brand={<AdminSidebarBrand />}
        labels={{
          navigation: t('title'),
          more: tNav('menu'),
          close: tCommon('cancel'),
          menu: tNav('menu'),
          toggleSidebar: tNav('toggleSidebar'),
        }}
        context={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t('title')}
            </h1>
            <PortalSurfaceIndicator role={user.role} className="min-w-0 max-w-full flex-wrap" />
          </div>
        }
        tools={tenantSelector}
        account={<AdminSidebarAccount user={user} />}
        sidebarAccount={<AdminSidebarAccount user={user} />}
      >
        <div className={styles.content}>{children}</div>
      </RoleShell>
    </div>
  );
}
