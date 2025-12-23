'use client';

import { useDashboardNavigation } from '@/hooks/use-dashboard-navigation';
import { Link, usePathname } from '@/i18n/routing';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { SidebarBrand } from './sidebar-brand';
import { SidebarUserMenu } from './sidebar-user-menu';

export function DashboardSidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const { items, role } = useDashboardNavigation();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
    >
      <SidebarBrand role={role} />

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest px-4 mb-2">
            {t('menu')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {items.map(item => {
                const isActive =
                  item.href === '/member'
                    ? pathname === '/member'
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      className={`
                        h-auto py-3 px-4 rounded-xl transition-all duration-300 
                        hover:bg-muted/50 hover:pl-6
                        data-[state=open]:bg-primary data-[state=open]:text-primary-foreground
                        ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-0'
                            : 'text-muted-foreground hover:text-foreground'
                        }
                      `}
                      isActive={isActive}
                    >
                      <Link href={item.href} className="flex items-center gap-3 font-medium">
                        <item.icon
                          className={`h-5 w-5 shrink-0 ${isActive ? 'animate-pulse' : ''}`}
                        />
                        <span className="group-data-[state=collapsed]:hidden">{item.title}</span>
                        {isActive && (
                          <div className="ml-auto h-2 w-2 rounded-full bg-white/20 animate-ping group-data-[state=collapsed]:hidden" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-white/10">
        <SidebarUserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
