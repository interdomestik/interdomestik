'use client';

import { Link, usePathname, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  SidebarRail,
} from '@interdomestik/ui';
import {
  BarChart,
  Briefcase,
  Check,
  ChevronUp,
  FileText,
  GitBranch,
  Globe,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

interface AdminSidebarProps {
  readonly className?: string;
  readonly user: {
    name: string;
    email: string;
    role: string;
  };
}

export function AdminSidebar({ className, user }: AdminSidebarProps) {
  const t = useTranslations('admin.sidebar');
  const tNav = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const withAdminContext = (href: string) => {
    const contextQueryString = searchParams.toString();
    if (!contextQueryString) return href;

    const [path, queryString] = href.split('?');
    const merged = new URLSearchParams(contextQueryString);
    if (queryString) {
      const destinationParams = new URLSearchParams(queryString);
      const destinationKeys = new Set(Array.from(destinationParams.keys()));
      for (const key of destinationKeys) {
        merged.delete(key);
        for (const value of destinationParams.getAll(key)) {
          merged.append(key, value);
        }
      }
    }

    const next = merged.toString();
    return next ? `${path}?${next}` : path;
  };

  const roleParam = searchParams.get('role');
  let peopleRole = 'members';
  if (roleParam?.includes('agent')) {
    peopleRole = 'agents';
  } else if (roleParam?.includes('staff') || roleParam?.includes('admin')) {
    peopleRole = 'staff';
  }

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  const sidebarItems = [
    {
      title: 'dashboard',
      href: '/admin',
      icon: LayoutDashboard,
    },
    {
      title: 'branches',
      href: '/admin/branches',
      icon: GitBranch,
      hidden: !['super_admin', 'tenant_admin', 'admin'].includes(user.role),
    },
    {
      title: 'claims',
      href: '/admin/claims',
      icon: FileText,
    },
    {
      title: 'members',
      href: '/admin/users',
      icon: Users,
      peopleKey: 'members',
    },
    {
      title: 'agents',
      href: '/admin/users?role=agent',
      icon: Briefcase,
      peopleKey: 'agents',
    },
    {
      title: 'staff',
      href: '/admin/users?role=admin,staff',
      icon: Shield,
      peopleKey: 'staff',
    },
    {
      title: 'analytics',
      href: '/admin/analytics',
      icon: BarChart,
    },
    {
      title: 'settings',
      href: '/admin/settings',
      icon: Settings,
      peopleKey: undefined,
    },
  ].filter(item => !item.hidden);

  return (
    <Sidebar
      data-testid="admin-sidebar"
      collapsible="icon"
      className={`border-r border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 ${className}`}
    >
      <SidebarHeader className="h-20 flex items-center justify-center border-b border-white/10">
        <Link
          href={withAdminContext('/admin')}
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

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {sidebarItems.map(item => {
                const isPeopleRoute = pathname.startsWith('/admin/users');
                let isActive = false;

                if (item.peopleKey !== undefined) {
                  isActive = isPeopleRoute && peopleRole === item.peopleKey;
                } else if (item.href === '/admin') {
                  isActive = pathname === '/admin';
                } else {
                  isActive = pathname.startsWith(item.href);
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={t(item.title)}
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
                      <Link
                        href={withAdminContext(item.href)}
                        className="flex items-center gap-3 font-medium"
                      >
                        <item.icon
                          className={`h-5 w-5 shrink-0 ${isActive ? 'animate-pulse' : ''}`}
                        />
                        <span className="group-data-[state=collapsed]:hidden">{t(item.title)}</span>
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

      <SidebarFooter className="p-3 border-t border-white/10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="w-full data-[state=open]:bg-muted/50 transition-all duration-300 rounded-xl"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-primary/50 text-white flex items-center justify-center font-bold shadow-md shrink-0">
                {user.name?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="flex flex-col overflow-hidden text-left flex-1 group-data-[state=collapsed]:hidden ml-2">
                <span className="text-sm font-semibold truncate text-foreground">{user.name}</span>
                <span className="text-xs text-muted-foreground truncate capitalize flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-green-500" />
                  {user.role}
                </span>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground group-data-[state=collapsed]:hidden ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" side="top" sideOffset={8}>
            <DropdownMenuLabel>{tNav('myAccount')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Globe className="mr-2 h-4 w-4" />
                <span>{tNav('language')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => router.replace(pathname, { locale: 'en' })}
                    className="cursor-pointer"
                  >
                    <span className="mr-2">🇬🇧</span> English
                    {locale === 'en' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.replace(pathname, { locale: 'sq' })}
                    className="cursor-pointer"
                  >
                    <span className="mr-2">🇦🇱</span> Shqip
                    {locale === 'sq' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.replace(pathname, { locale: 'mk' })}
                    className="cursor-pointer"
                  >
                    <span className="mr-2">🇲🇰</span> Македонски
                    {locale === 'mk' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.replace(pathname, { locale: 'sr' })}
                    className="cursor-pointer"
                  >
                    <span className="mr-2">🇷🇸</span> Srpski
                    {locale === 'sr' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/" className="cursor-pointer font-medium">
                <Home className="mr-2 h-4 w-4" />
                {tNav('backToWebsite')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-red-500 focus:text-red-500 font-medium"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {tNav('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
