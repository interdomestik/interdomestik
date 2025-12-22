'use client';

import { Link, usePathname, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@interdomestik/ui';
import { Check, ChevronUp, Globe, Home, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

export function SidebarUserMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  const user = session?.user;
  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground rounded-xl hover:bg-muted/50 transition-colors"
            >
              <Avatar className="h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <AvatarImage src={user.image || ''} alt={user.name || ''} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {(user as any).role || t('memberRole')}
                </span>
              </div>
              <ChevronUp className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="bottom"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.image || ''} alt={user.name || ''} />
                  <AvatarFallback className="rounded-lg">{user.name?.[0]}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Globe className="mr-2 h-4 w-4" />
                <span>{t('language')}</span>
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
              <Link href="/" className="cursor-pointer">
                <Home className="mr-2 h-4 w-4" />
                {t('backToWebsite')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-500 focus:text-red-500 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
