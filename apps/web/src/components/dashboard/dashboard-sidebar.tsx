'use client';

import { useDashboardNavigation } from '@/hooks/use-dashboard-navigation';
import { usePathname } from '@/i18n/routing';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from '@interdomestik/ui';
import { LayoutGroup } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { NavItem } from './nav-item';
import { SidebarBrand } from './sidebar-brand';
import { SidebarUserMenu } from './sidebar-user-menu';

export function DashboardSidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const { memberItems, agentItems, adminItems, role } = useDashboardNavigation();
  const isAgent = role === 'agent';

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
    >
      <SidebarBrand role={role} />

      <SidebarContent className="px-3 py-4 space-y-2">
        <LayoutGroup id="sidebar-nav">
          {/* Section 1: Dashboard (Context Aware) */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* For Agents, the primary link is the Hub. For Members, it's the Overview. */}
                {isAgent
                  ? agentItems.slice(0, 1).map(item => (
                      <SidebarMenuItem key={item.href}>
                        <NavItem
                          href={item.href}
                          title={item.title}
                          icon={item.icon}
                          isActive={pathname === '/agent'}
                        />
                      </SidebarMenuItem>
                    ))
                  : memberItems.slice(0, 1).map(item => (
                      <SidebarMenuItem key={item.href}>
                        <NavItem
                          href={item.href}
                          title={item.title}
                          icon={item.icon}
                          isActive={pathname === '/member'}
                        />
                      </SidebarMenuItem>
                    ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Section 2: Sales & Recruitment (Agents Only) */}
          {isAgent && agentItems.length > 1 && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500/50 px-4 mb-2">
                Sales & Network
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {agentItems.slice(1).map(item => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <NavItem
                          href={item.href}
                          title={item.title}
                          icon={item.icon}
                          isActive={isActive}
                        />
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Section 3: Personal Coverage (Claims, Docs) */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 px-4 mb-2">
              {isAgent ? 'My Protection' : 'Membership'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {/* For Agents, show all member items (Claims, etc). For Members, show rest. */}
                {memberItems.slice(isAgent ? 0 : 1).map(item => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <NavItem
                        href={item.href}
                        title={item.title}
                        icon={item.icon}
                        isActive={isActive}
                      />
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Section 4: Admin (If applicable) */}
          {adminItems.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/50 px-4 mb-2">
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {adminItems.map(item => (
                    <SidebarMenuItem key={item.href}>
                      <NavItem
                        href={item.href}
                        title={item.title}
                        icon={item.icon}
                        isActive={pathname.startsWith(item.href)}
                      />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </LayoutGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-white/10">
        <SidebarUserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
