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
  BarChart3,
  Briefcase,
  FilePlus,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LayoutTemplate,
  Phone,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DashboardSidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  /* Define menus per role */
  const memberItems = [
    {
      title: t('overview'),
      href: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: t('claims'),
      href: '/dashboard/claims',
      icon: FileText,
    },
    {
      title: t('documents'),
      href: '/dashboard/documents',
      icon: FolderOpen,
    },
    {
      title: t('newClaim'),
      href: '/dashboard/claims/new',
      icon: FilePlus,
    },
    {
      title: t('consumerRights'),
      href: '/dashboard/rights',
      icon: Shield,
    },
    {
      title: t('settings'),
      href: '/dashboard/settings',
      icon: Settings,
    },
    {
      title: t('help'),
      href: '/dashboard/help',
      icon: Phone,
    },
  ];

  const agentItems = [
    {
      title: t('agentCrm'),
      href: '/agent/crm',
      icon: BarChart3,
    },
    {
      title: t('agentLeads'),
      href: '/agent/leads',
      icon: Users,
    },
    {
      title: t('agentWorkspace'), // mapped to 'Claims' in translations usually, or "Agent Workspace" is the claims queue?
      // t('claims') might be better if it's just status list.
      // But /agent/claims is the route.
      href: '/agent/claims',
      icon: Briefcase,
    },
    {
      title: t('settings'),
      href: '/dashboard/settings',
      icon: Settings,
    },
    {
      title: t('help'),
      href: '/dashboard/help',
      icon: Phone,
    },
  ];

  let items = [...memberItems];

  if (role === 'agent') {
    items = agentItems;
  } else if (role === 'admin') {
    // Admin sees member items + admin dashboard? Or just Admin dashboard?
    // Usually Admin needs access to everything or a specific Admin sidebar.
    // For now, appending Admin Dashboard to member items as before.
    items.push({
      title: t('adminDashboard'),
      href: '/admin/claims',
      icon: LayoutTemplate,
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
          <SidebarGroupLabel>{t('menu')}</SidebarGroupLabel>
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
