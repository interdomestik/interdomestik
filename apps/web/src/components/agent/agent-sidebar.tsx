'use client';

import { Link, usePathname, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@interdomestik/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import {
  BarChart3,
  Briefcase,
  ChevronUp,
  DollarSign,
  Home,
  LogOut,
  Settings,
  Shield,
  UserCircle,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export function AgentSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();

  const navItems = [
    {
      title: t('overview'),
      href: '/agent',
      icon: Home,
    },
    {
      title: t('workspacePro'),
      href: '/agent/workspace',
      icon: BarChart3,
    },
    {
      title: t('agentCrm'),
      href: '/agent/crm',
      icon: BarChart3,
    },
    {
      title: t('agentLeads'),
      href: '/agent/leads',
      icon: Briefcase,
    },
    {
      title: t('members'),
      href: '/agent/members',
      icon: Users,
    },
    {
      title: t('commissions'),
      href: '/agent/commissions',
      icon: DollarSign,
    },
    {
      title: t('settings'),
      href: '/agent/settings',
      icon: Settings,
    },
  ];

  const showProSidebar =
    pathname.startsWith('/agent/workspace') ||
    pathname.startsWith('/agent/crm') ||
    pathname.startsWith('/agent/members') ||
    pathname.startsWith('/agent/clients') ||
    pathname.startsWith('/agent/commissions');

  // Filter items for Lite view
  const displayItems = showProSidebar
    ? navItems
    : navItems.filter(item =>
        ['/agent', '/agent/leads', '/agent/members', '/agent/settings'].includes(item.href)
      );

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/agent">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t('agentPortal')}</span>
                  <span className="truncate text-xs">{t('salesDashboard')}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {displayItems.map(item => {
                const isActive =
                  item.href === '/agent' ? pathname === '/agent' : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={session?.user?.image || ''} alt={session?.user?.name || ''} />
                    <AvatarFallback className="rounded-lg">
                      {session?.user?.name?.[0]?.toUpperCase() || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{session?.user?.name || 'Agent'}</span>
                    <span className="truncate text-xs">{session?.user?.email}</span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <Link href="/agent/settings">
                    <UserCircle className="mr-2 size-4" />
                    {t('myAccount')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 size-4" />
                  {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
