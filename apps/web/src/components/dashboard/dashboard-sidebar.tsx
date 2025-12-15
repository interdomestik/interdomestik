'use client';

import { Link, usePathname } from '@/i18n/routing';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@interdomestik/ui';
import { FilePlus, FileText, LayoutDashboard, Phone, Settings, Shield } from 'lucide-react';

const sidebarItems = [
  {
    title: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'My Claims',
    href: '/dashboard/claims',
    icon: FileText,
  },
  {
    title: 'New Claim',
    href: '/dashboard/claims/new',
    icon: FilePlus,
  },
  {
    title: 'Consumer Rights',
    href: '/dashboard/rights',
    icon: Shield,
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
  {
    title: 'Need Help?',
    href: '/dashboard/help',
    icon: Phone,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  // We can access state here if needed
  // const { state } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 flex items-center justify-center border-b">
        <div className="flex items-center gap-2 font-bold text-xl px-2 w-full group-data-[collapsible=icon]:justify-center">
          <Shield className="h-6 w-6 text-primary shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Interdomestik</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map(item => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
