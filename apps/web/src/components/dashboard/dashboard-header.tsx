import { NotificationBell } from '@/components/notifications';
import { Separator, SidebarTrigger } from '@interdomestik/ui';
import { CommandMenuTrigger } from './command-menu-trigger';
import { UserNav } from './user-nav';

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-white/10 bg-background/60 px-4 transition-all backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
      </div>

      <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
        <div className="w-full flex-1 md:w-auto md:flex-none">
          <CommandMenuTrigger />
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <UserNav />
        </div>
      </div>
    </header>
  );
}
