'use client';

import { Link, usePathname, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { signOutAndRedirectToLogin } from '@/lib/auth/logout';
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
import { Check, ChevronUp, Globe, Home, LogOut, User } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientShellUser } from '@/components/shell/client-shell-user';
import { getRoleLabel } from '@/lib/roles-i18n';

function localeSwitchHref(
  pathname: string,
  search: string,
  retainedQueryKeys: readonly string[]
): string {
  if (retainedQueryKeys.length === 0) return pathname;

  const retainedKeys = new Set(retainedQueryKeys);
  const retainedParams = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    if (retainedKeys.has(key)) retainedParams.append(key, value);
  }

  const query = retainedParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function SidebarUserMenuInner({
  user,
  retainedLocaleQueryKeys,
  profileHref,
}: Readonly<{
  user: ClientShellUser | null;
  retainedLocaleQueryKeys: readonly string[];
  profileHref?: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  const switchLocale = (nextLocale: 'en' | 'sq' | 'mk' | 'sr' | 'de') => {
    router.replace(localeSwitchHref(pathname, window.location.search, retainedLocaleQueryKeys), {
      locale: nextLocale,
    });
  };

  const handleSignOut = async () => {
    await signOutAndRedirectToLogin({
      locale,
      signOut: authClient.signOut,
    });
  };

  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="rounded-xl border border-slate-200 bg-white/80 transition-colors hover:bg-slate-50 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-900"
              data-testid="sidebar-user-menu-button"
            >
              <Avatar className="h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <AvatarImage src={user.image || ''} alt={user.name || ''} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {getRoleLabel(tCommon, (user as { role?: string }).role, tCommon('roles.member'))}
                </span>
              </div>
              <ChevronUp className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur [&_[role=menuitem]]:min-h-11"
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
            {profileHref && (
              <DropdownMenuItem asChild>
                <Link href={profileHref} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  {t('profile')}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Globe className="mr-2 h-4 w-4" />
                <span>{t('language')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="[&_[role=menuitem]]:min-h-11">
                  <DropdownMenuItem onClick={() => switchLocale('en')} className="cursor-pointer">
                    <span className="mr-2">🇬🇧</span> English
                    {locale === 'en' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => switchLocale('sq')} className="cursor-pointer">
                    <span className="mr-2">🇦🇱</span> Shqip
                    {locale === 'sq' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => switchLocale('mk')} className="cursor-pointer">
                    <span className="mr-2">🇲🇰</span> Македонски
                    {locale === 'mk' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => switchLocale('sr')} className="cursor-pointer">
                    <span className="mr-2">🇷🇸</span> Srpski
                    {locale === 'sr' && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => switchLocale('de')} className="cursor-pointer">
                    <span className="mr-2">🇩🇪</span> Deutsch
                    {locale === 'de' && <Check className="ml-auto h-4 w-4" />}
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
              className="min-h-11 text-red-500 focus:text-red-500 cursor-pointer"
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

function SidebarUserMenuFromSession({
  retainedLocaleQueryKeys,
  profileHref,
}: Readonly<{
  retainedLocaleQueryKeys: readonly string[];
  profileHref?: string;
}>) {
  const { data: session } = authClient.useSession();
  return (
    <SidebarUserMenuInner
      retainedLocaleQueryKeys={retainedLocaleQueryKeys}
      profileHref={profileHref}
      user={(session?.user as ClientShellUser | undefined) ?? null}
    />
  );
}

export function SidebarUserMenu({
  user,
  retainedLocaleQueryKeys = [],
  profileHref,
}: Readonly<{
  user?: ClientShellUser | null;
  retainedLocaleQueryKeys?: readonly string[];
  profileHref?: string;
}>) {
  if (user !== undefined) {
    return (
      <SidebarUserMenuInner
        user={user}
        retainedLocaleQueryKeys={retainedLocaleQueryKeys}
        profileHref={profileHref}
      />
    );
  }

  return (
    <SidebarUserMenuFromSession
      retainedLocaleQueryKeys={retainedLocaleQueryKeys}
      profileHref={profileHref}
    />
  );
}
