'use client';

import { Link, usePathname, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@interdomestik/ui';
import {
  BarChart,
  Briefcase,
  ChevronUp,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AdminSidebarProps {
  className?: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export function AdminSidebar({ className, user }: AdminSidebarProps) {
  const t = useTranslations('admin.sidebar');
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  const containerClassName = [
    'flex flex-col h-screen border-r border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const sidebarItems = [
    {
      title: 'dashboard',
      href: '/admin',
      icon: LayoutDashboard,
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
    },
    {
      title: 'agents',
      href: '/admin/agents',
      icon: Briefcase,
    },
    {
      title: 'staff',
      href: '/admin/staff',
      icon: Shield,
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
    },
  ];

  return (
    <div className={containerClassName}>
      <div className="p-6 border-b border-white/10">
        <Link
          href="/admin"
          className="flex items-center gap-3 font-bold text-xl tracking-tight group"
        >
          <div className="h-10 w-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
            <Shield className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className="leading-none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              Admin
            </span>
            <span className="text-xs text-muted-foreground font-medium mt-0.5">Control Panel</span>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <nav className="grid gap-1.5 px-4">
          {sidebarItems.map((item, index) => {
            // Exact match for root, startsWith for others to handle subpages
            const isActive =
              item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

            return (
              <Link
                key={index}
                href={item.href}
                className={`
                  relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300
                  ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:pl-5'
                  }
                `}
              >
                <item.icon className={`h-4 w-4 ${isActive ? 'animate-pulse' : ''}`} />
                <span>{t(item.title)}</span>
                {isActive && (
                  <div className="absolute right-3 h-2 w-2 rounded-full bg-white/20 animate-ping" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-white/10 bg-muted/20 backdrop-blur-md m-4 rounded-2xl">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-3 w-full outline-none group cursor-pointer">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-primary to-primary/50 text-white flex items-center justify-center font-bold shadow-md transition-transform group-hover:scale-105">
              {user.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex flex-col overflow-hidden text-left flex-1">
              <span className="text-sm font-semibold truncate">{user.name}</span>
              <span className="text-xs text-muted-foreground truncate capitalize flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                {user.role}
              </span>
            </div>
            <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" side="top" sideOffset={8}>
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Globe className="mr-2 h-4 w-4" />
                <span>Language</span>
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
            <DropdownMenuItem asChild>
              <Link href="/" className="cursor-pointer font-medium">
                <Home className="mr-2 h-4 w-4" />
                Back to Website
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-red-500 focus:text-red-500 font-medium"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
