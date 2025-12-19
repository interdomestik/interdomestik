'use client';

import { Link, usePathname } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
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
import {
  Briefcase,
  FilePlus,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  Phone,
  Settings,
  Shield,
} from 'lucide-react';

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
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const items = [...sidebarItems];

  if (role === 'admin') {
    items.push({
      title: 'Admin Dashboard',
      href: '/admin/claims',
      icon: LayoutTemplate,
    });
  }

  if (role === 'agent') {
    items.push({
      title: 'Agent Workspace',
      href: '/agent/claims',
      icon: Briefcase,
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex items-center justify-center border-b">
        <div className="flex items-center gap-2 font-bold text-xl px-2 w-full group-data-[state=collapsed]:justify-center">
          <Shield className="h-6 w-6 text-primary shrink-0" />
          <span className="group-data-[state=collapsed]:hidden">Interdomestik</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
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
