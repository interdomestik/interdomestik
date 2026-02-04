'use client';

import { canAccessAdmin } from '@/actions/admin-access';
import { Link, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { isAdmin } from '@/lib/roles.core';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@interdomestik/ui';
import { Briefcase, LayoutTemplate, LogOut, Settings, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function UserNav() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [adminAccess, setAdminAccess] = useState(false);
  const { data: session } = authClient.useSession();
  const t = useTranslations('nav');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!session) return;

    const role = (session.user as unknown as { role?: string })?.role ?? null;
    if (isAdmin(role)) {
      setAdminAccess(true);
      return;
    }

    let cancelled = false;
    canAccessAdmin()
      .then((ok: boolean) => {
        if (!cancelled) setAdminAccess(ok);
      })
      .catch(() => {
        // Ignore; keep adminAccess false.
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  // Avoid SSR/CSR id mismatches from Radix by rendering menu only after mount.
  if (!mounted || !session) {
    return (
      <Button variant="ghost" className="relative h-9 w-9 rounded-full" disabled>
        <Avatar className="h-9 w-9">
          <AvatarFallback>...</AvatarFallback>
        </Avatar>
      </Button>
    );
  }

  const { user } = session;
  const role = (user as { role?: string }).role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="user-nav">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.image || ''} alt={user.name || 'User'} />
            <AvatarFallback>{user.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile" className="w-full cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              <span>{t('profile')}</span>
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="w-full cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>{t('settings')}</span>
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          {(isAdmin(role) || adminAccess) && (
            <DropdownMenuItem asChild>
              <Link href="/admin/overview" className="w-full cursor-pointer">
                <LayoutTemplate className="mr-2 h-4 w-4" />
                <span>{t('adminDashboard')}</span>
              </Link>
            </DropdownMenuItem>
          )}
          {role === 'agent' && (
            <DropdownMenuItem asChild>
              <Link href="/agent/members" className="w-full cursor-pointer">
                <Briefcase className="mr-2 h-4 w-4" />
                <span>{t('agentWorkspace')}</span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('logout')}</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
