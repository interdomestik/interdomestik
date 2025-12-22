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
      href: '/admin',
      icon: LayoutTemplate,
    });
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
    >
      <SidebarHeader className="h-20 flex items-center justify-center border-b border-white/10">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 font-bold text-xl px-2 w-full group-data-[state=collapsed]:justify-center group hover:opacity-90 transition-opacity"
        >
          <div className="h-10 w-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105 shrink-0">
            <Shield className="h-6 w-6" />
          </div>
          <div className="flex flex-col group-data-[state=collapsed]:hidden animate-in fade-in duration-300">
            <span className="leading-none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 tracking-tight">
              Interdomestik
            </span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">
              {role === 'agent' ? 'Agent Portal' : 'Member Portal'}
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest px-4 mb-2">
            {t('menu')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {items.map(item => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
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
      <SidebarRail />
    </Sidebar>
  );
}
