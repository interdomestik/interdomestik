'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@interdomestik/ui';
import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { recordMobileSheetOpener, type PendingSheetOpener } from './mobile-sheet-focus';
import { RoleShellMobileNavigation, type RoleShellLabels } from './role-shell-mobile-navigation';
import { ShellNavigation, type ShellNavigationItem } from './shell-navigation';

type RoleShellProps = Readonly<{
  children: ReactNode;
  items: readonly ShellNavigationItem[];
  primaryItems?: readonly ShellNavigationItem[];
  pathname: string;
  labels: RoleShellLabels;
  brand: ReactNode;
  context: ReactNode;
  tools?: ReactNode;
  account: ReactNode;
  sidebarAccount: ReactNode;
  mobileNavigation?: 'bottom' | 'drawer';
}>;

function RoleShellHeaderTrigger({
  mode,
  labels,
  pendingOpener,
  onOpen,
}: Readonly<{
  mode: 'bottom' | 'drawer';
  labels: RoleShellLabels;
  pendingOpener: RefObject<PendingSheetOpener | null>;
  onOpen: () => void;
}>): ReactNode {
  const { isMobile, openMobile } = useSidebar();
  return (
    <SidebarTrigger
      className={mode === 'bottom' ? 'size-11 shrink-0' : 'hidden size-11 shrink-0 md:inline-flex'}
      title={labels.toggleSidebar ?? labels.navigation}
      aria-label={labels.toggleSidebar ?? labels.navigation}
      onClick={event => {
        const opening = isMobile && !openMobile;
        recordMobileSheetOpener(pendingOpener, event.currentTarget, opening);
        if (opening) onOpen();
      }}
    />
  );
}

function RoleShellDesktopSidebar({
  items,
  pathname,
  labels,
  brand,
  sidebarAccount,
}: RoleShellProps): ReactNode {
  const { isMobile } = useSidebar();
  if (isMobile) return null;

  return (
    <Sidebar collapsible="icon" className="shrink-0 border-r">
      <div data-testid="role-shell-sidebar" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="[&_a]:min-h-11 group-data-[state=collapsed]:[&_[data-sidebar=header]]:m-0 group-data-[state=collapsed]:[&_[data-sidebar=header]]:p-0">
          {brand}
        </div>
        <SidebarContent className="min-w-0 px-2 py-3 group-data-[state=collapsed]:px-0 [&_a]:min-w-11">
          <ShellNavigation
            label={labels.menu ?? labels.navigation}
            pathname={pathname}
            groups={[{ id: 'workspace', items }]}
          />
        </SidebarContent>
        <SidebarFooter className="min-w-0 border-t [&_button]:min-h-11 [&_button]:min-w-11">
          {sidebarAccount}
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}

/** Presentation only: callers supply admitted destinations, context and account controls. */
export function RoleShell(props: RoleShellProps): ReactNode {
  const { children, context, tools, account, mobileNavigation = 'bottom', labels } = props;
  const [mobilePanel, setMobilePanel] = useState<'more' | 'sidebar'>('more');
  const pendingOpener = useRef<PendingSheetOpener | null>(null);
  const mobileNavigationControl = (
    <RoleShellMobileNavigation
      items={props.items}
      primaryItems={props.primaryItems ?? []}
      pathname={props.pathname}
      labels={labels}
      account={props.sidebarAccount}
      mode={mobileNavigation}
      panel={mobilePanel}
      pendingOpener={pendingOpener}
      onMoreOpen={() => setMobilePanel('more')}
    />
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      className="min-w-0"
      data-testid="role-shell"
      style={{ '--sidebar-width-icon': '4rem' } as CSSProperties}
    >
      <RoleShellDesktopSidebar {...props} />
      <div className="bg-mesh flex min-h-svh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 min-w-0 flex-wrap items-center gap-2 border-b bg-background/95 py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-xl">
          <RoleShellHeaderTrigger
            mode={mobileNavigation}
            labels={labels}
            pendingOpener={pendingOpener}
            onOpen={() => setMobilePanel('sidebar')}
          />
          {mobileNavigation === 'drawer' && mobileNavigationControl}
          <div className="min-w-0 flex-1 break-words">{context}</div>
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 md:w-auto [&_button]:min-h-11 [&_button]:min-w-11">
            {tools}
            {account}
          </div>
        </header>
        <main
          className={
            mobileNavigation === 'bottom'
              ? 'min-w-0 flex-1 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-8 md:pt-6'
              : 'min-w-0 flex-1 md:p-8 md:pt-6'
          }
        >
          {children}
        </main>
      </div>
      {mobileNavigation === 'bottom' && mobileNavigationControl}
    </SidebarProvider>
  );
}
