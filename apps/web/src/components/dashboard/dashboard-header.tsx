import { NotificationBell } from '@/components/notifications';
import { Separator, SidebarTrigger } from '@interdomestik/ui';
import { UserNav } from './user-nav';

export function DashboardHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-md sticky top-0 z-30 px-4 transition-all">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
      </div>

      <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
        <div className="w-full flex-1 md:w-auto md:flex-none">{/* Breadcrumbs or Search */}</div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <UserNav />
        </div>
      </div>
    </header>
  );
}
