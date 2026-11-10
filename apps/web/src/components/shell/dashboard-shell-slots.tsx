'use client';

import { CommandMenuTrigger } from '@/components/dashboard/command-menu-trigger';
import { PortalSurfaceIndicator } from '@/components/dashboard/portal-surface-indicator';
import { SidebarBrand } from '@/components/dashboard/sidebar-brand';
import { UserNav } from '@/components/dashboard/user-nav';
import { NotificationBell } from '@/components/notifications';
import { useTranslations } from 'next-intl';
import type { ClientShellUser } from './client-shell-user';

/** Existing dashboard chrome; callers retain navigation and locale-context decisions. */
export function useDashboardShellSlots(user: ClientShellUser) {
  const t = useTranslations('nav');
  return {
    brand: <SidebarBrand role={user.role} />,
    context: <PortalSurfaceIndicator role={user.role} className="min-w-0 max-w-full flex-wrap" />,
    tools: (
      <>
        <div className="min-w-0 max-w-full flex-1 md:flex-none">
          <CommandMenuTrigger />
        </div>
        <NotificationBell subscriberId={user.id} prefetchNotifications={false} />
      </>
    ),
    account: (
      <fieldset aria-label={t('myAccount')} className="m-0 min-w-0 border-0 p-0">
        <UserNav user={user} adminAccess={false} />
      </fieldset>
    ),
  };
}
