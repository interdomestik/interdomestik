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
import { NavItem } from './nav-item';
import { SidebarBrand } from './sidebar-brand';
import { SidebarUserMenu } from './sidebar-user-menu';

export function DashboardSidebar({ agentTier = 'standard' }: { agentTier?: string }) {
  const pathname = usePathname();
  const { memberItems, agentItems, adminItems, role } = useDashboardNavigation(agentTier);
  const isAgent = role === 'agent';

  return (
    <Sidebar
      collapsible="icon"
      className={`border-r transition-colors duration-500 ${
        isAgent
          ? 'border-white/10 bg-slate-950/40 backdrop-blur-2xl'
          : 'border-slate-200/80 bg-gradient-to-b from-slate-50/95 via-white/95 to-slate-100/95 backdrop-blur-xl'
      } supports-[backdrop-filter]:bg-transparent`}
    >
      <SidebarBrand role={role} />

      <SidebarContent className="mx-2 my-3 rounded-2xl border border-white/70 bg-white/70 px-2.5 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.65)] backdrop-blur-xl">
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
                <SidebarMenu className="gap-1.5">
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

          {/* Section 3: Membership (Members only) */}
          {!isAgent && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 px-4 mb-2">
                Membership
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {memberItems.slice(1).map(item => {
                    const isExactMatch = pathname === item.href;
                    const isParentRoute = pathname.startsWith(item.href + '/');
                    const hasMoreSpecificMatch = memberItems.some(
                      other =>
                        other.href !== item.href &&
                        other.href.startsWith(item.href + '/') &&
                        pathname.startsWith(other.href)
                    );
                    const isActive = isExactMatch || (isParentRoute && !hasMoreSpecificMatch);

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

          {/* Section 4: Admin (If applicable) */}
          {adminItems.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/50 px-4 mb-2">
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
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

      <SidebarFooter className="m-2 rounded-xl border border-white/70 bg-white/70 p-2 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.7)] backdrop-blur-xl">
        <SidebarUserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
