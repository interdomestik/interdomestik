'use client';

import { Link } from '@/i18n/routing';
import {
  Button,
  Sheet,
  SheetContent,
  SheetTrigger,
  SidebarFooter,
  useSidebar,
} from '@interdomestik/ui';
import { Menu, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  getActiveShellNavigationItem,
  ShellNavigation,
  type ShellNavigationItem,
} from './shell-navigation';

export type RoleShellLabels = Readonly<{
  navigation: string;
  more: string;
  close: string;
  menu?: string;
  toggleSidebar?: string;
}>;

export function RoleShellMobileNavigation({
  items,
  primaryItems,
  pathname,
  labels,
  account,
  mode,
  panel = 'more',
  pendingOpener,
  onMoreOpen,
}: Readonly<{
  items: readonly ShellNavigationItem[];
  primaryItems: readonly ShellNavigationItem[];
  pathname: string;
  labels: RoleShellLabels;
  account: ReactNode;
  mode: 'bottom' | 'drawer';
  panel?: 'more' | 'sidebar';
  pendingOpener: RefObject<HTMLElement | null>;
  onMoreOpen?: () => void;
}>): ReactNode {
  const { openMobile, setOpenMobile, isMobile } = useSidebar();
  const returnFocus = useRef<HTMLElement | null>(null);
  const isDrawer = mode === 'drawer' || panel === 'sidebar';
  const primaryHrefs = new Set(primaryItems.map(item => item.href));
  const secondaryItems = items.filter(item => !primaryHrefs.has(item.href));
  const visibleItems = isDrawer ? items : secondaryItems;
  const active = getActiveShellNavigationItem(items, pathname);
  const moreActive = secondaryItems.some(item => item.href === active?.href);
  const title = isDrawer ? (labels.menu ?? labels.navigation) : labels.more;

  useEffect(() => {
    if (!isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  return (
    <Sheet open={isMobile && openMobile} onOpenChange={setOpenMobile}>
      {mode === 'drawer' ? (
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 md:hidden"
            data-sidebar="trigger"
            aria-label={labels.toggleSidebar ?? labels.navigation}
            onClick={event => {
              pendingOpener.current = event.currentTarget;
            }}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        </SheetTrigger>
      ) : (
        <nav
          aria-label={labels.navigation}
          data-testid="role-shell-bottom-nav"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-1 backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto flex max-w-lg items-stretch gap-1">
            {primaryItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.prefetch}
                aria-current={active?.href === item.href ? 'page' : undefined}
                className="flex min-h-14 min-w-11 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-xs font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                <item.icon aria-hidden="true" className="size-5 shrink-0" />
                <span className="w-full break-words">{item.shortTitle ?? item.title}</span>
              </Link>
            ))}
            <SheetTrigger asChild>
              <button
                type="button"
                onClick={event => {
                  pendingOpener.current = event.currentTarget;
                  onMoreOpen?.();
                }}
                data-active={moreActive}
                className="flex min-h-14 min-w-11 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
              >
                <MoreHorizontal aria-hidden="true" className="size-5 shrink-0" />
                <span className="w-full break-words">{labels.more}</span>
              </button>
            </SheetTrigger>
          </div>
        </nav>
      )}
      <SheetContent
        side={isDrawer ? 'left' : 'bottom'}
        data-sidebar="sidebar"
        data-mobile="true"
        titleText={title}
        descriptionText={labels.navigation}
        closeLabel={labels.close}
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          returnFocus.current =
            pendingOpener.current ??
            (activeElement instanceof HTMLElement && activeElement !== document.body
              ? activeElement
              : null);
          pendingOpener.current = null;
        }}
        onCloseAutoFocus={event => {
          if (returnFocus.current?.isConnected && returnFocus.current !== document.body) {
            event.preventDefault();
            returnFocus.current.focus();
          }
          returnFocus.current = null;
        }}
        className="max-h-[85dvh] min-w-0 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-16 motion-reduce:animate-none motion-reduce:transition-none [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center"
      >
        <div className="min-w-0 space-y-4">
          <p className="text-lg font-semibold">{title}</p>
          <ShellNavigation
            label={labels.menu ?? labels.navigation}
            pathname={pathname}
            groups={[{ id: 'workspace', items: visibleItems }]}
          />
          <SidebarFooter className="min-w-0 border-t pt-4 [&_button]:min-h-11 [&_button]:min-w-11">
            {account}
          </SidebarFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
