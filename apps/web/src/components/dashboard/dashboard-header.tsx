'use client';

import { NotificationBell } from '@/components/notifications';
import { Separator, SidebarTrigger } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { CommandMenuTrigger } from './command-menu-trigger';
import { PortalSurfaceIndicator } from './portal-surface-indicator';
import { UserNav } from './user-nav';

type DashboardHeaderUser = Readonly<{
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
}>;

export function DashboardHeader({
  user,
  adminAccess,
  prefetchNotifications = false,
}: Readonly<{
  user?: DashboardHeaderUser | null;
  adminAccess?: boolean;
  prefetchNotifications?: boolean;
}>) {
  const t = useTranslations('nav');

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-white/10 bg-background/60 px-4 transition-all backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        <SidebarTrigger
          className="-ml-1"
          title={t('toggleSidebar')}
          aria-label={t('toggleSidebar')}
        />
        <Separator orientation="vertical" className="mr-2 h-4" />
      </div>

      <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
        <div className="w-full flex-1 md:w-auto md:flex-none">
          <CommandMenuTrigger />
        </div>
        <div className="flex items-center gap-4">
          <PortalSurfaceIndicator role={user?.role} />
          <NotificationBell subscriberId={user?.id} prefetchNotifications={prefetchNotifications} />
          <UserNav user={user} adminAccess={adminAccess} />
        </div>
      </div>
    </header>
  );
}
