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

export type DashboardHeaderDensity = 'default' | 'responsive-compact';

const HEADER_BASE_CLASS =
  'sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-white/10 bg-background/60 px-4 transition-all backdrop-blur-xl supports-[backdrop-filter]:bg-background/60';

export function DashboardHeader({
  user,
  adminAccess,
  prefetchNotifications = false,
  density = 'default',
}: Readonly<{
  user?: DashboardHeaderUser | null;
  adminAccess?: boolean;
  prefetchNotifications?: boolean;
  density?: DashboardHeaderDensity;
}>) {
  const t = useTranslations('nav');
  const isCompact = density === 'responsive-compact';

  return (
    <header
      className={
        isCompact
          ? `${HEADER_BASE_CLASS} h-auto min-h-16 min-w-0 flex-wrap py-2 md:h-16 md:flex-nowrap md:py-0`
          : `${HEADER_BASE_CLASS} h-16`
      }
      data-density={isCompact ? 'responsive-compact' : undefined}
    >
      <div className="flex items-center gap-2">
        <SidebarTrigger
          className="-ml-1"
          title={t('toggleSidebar')}
          aria-label={t('toggleSidebar')}
        />
        <Separator orientation="vertical" className="mr-2 h-4" />
      </div>

      <div
        className={
          isCompact
            ? 'flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 md:flex-nowrap md:justify-end'
            : 'flex flex-1 items-center justify-between space-x-2 md:justify-end'
        }
      >
        <div
          className={
            isCompact
              ? 'w-full min-w-0 flex-1 md:w-auto md:flex-none'
              : 'w-full flex-1 md:w-auto md:flex-none'
          }
        >
          <CommandMenuTrigger />
        </div>
        <div
          className={
            isCompact
              ? 'flex min-w-0 flex-wrap items-center justify-end gap-2 md:flex-nowrap md:gap-4'
              : 'flex items-center gap-4'
          }
        >
          <PortalSurfaceIndicator
            role={user?.role}
            className={isCompact ? 'min-w-0 max-w-full flex-wrap' : undefined}
          />
          <NotificationBell subscriberId={user?.id} prefetchNotifications={prefetchNotifications} />
          <UserNav user={user} adminAccess={adminAccess} />
        </div>
      </div>
    </header>
  );
}
