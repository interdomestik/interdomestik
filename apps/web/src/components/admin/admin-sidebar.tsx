'use client';

import { ShellNavigation } from '@/components/shell/shell-navigation';
import { Link, usePathname } from '@/i18n/routing';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@interdomestik/ui';
import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AdminSidebarAccount } from './admin-sidebar-account';
import { withAdminContext } from './admin-sidebar-context';
import { useAdminSidebarNavigation, type AdminSidebarUser } from './admin-sidebar-navigation';

export function AdminSidebarBrand() {
  const t = useTranslations('admin.sidebar');
  const searchParams = useSearchParams();
  return (
    <SidebarHeader className="h-20 flex items-center justify-center border-b border-white/10">
      <Link
        href={withAdminContext('/admin/overview', searchParams)}
        className="flex items-center gap-3 font-bold text-xl px-2 w-full group-data-[state=collapsed]:justify-center group hover:opacity-90 transition-opacity"
      >
        <div className="h-10 w-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105 shrink-0">
          <Shield className="h-6 w-6" />
        </div>
        <div className="flex flex-col group-data-[state=collapsed]:hidden animate-in fade-in duration-300">
          <span className="leading-none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 tracking-tight text-sm font-bold truncate">
            {t('title')}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1 truncate">
            {t('subtitle')}
          </span>
        </div>
      </Link>
    </SidebarHeader>
  );
}

export function AdminSidebar({
  className,
  user,
}: Readonly<{ className?: string; user: AdminSidebarUser }>) {
  const tNav = useTranslations('nav');
  const pathname = usePathname();
  const items = useAdminSidebarNavigation(user);
  return (
    <Sidebar data-testid="admin-sidebar" collapsible="icon" className={className}>
      <AdminSidebarBrand />
      <SidebarContent className="px-3 py-4 group-data-[state=collapsed]:px-0">
        <ShellNavigation
          label={tNav('menu')}
          pathname={pathname}
          groups={[{ id: 'admin', items }]}
        />
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-white/10">
        <AdminSidebarAccount user={user} />
      </SidebarFooter>
      <SidebarRail title={tNav('toggleSidebar')} aria-label={tNav('toggleSidebar')} />
    </Sidebar>
  );
}
