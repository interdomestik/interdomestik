'use client';

import type { ClientShellUser } from '@/components/shell/client-shell-user';
import {
  buildDashboardNavigationModel,
  useDashboardNavigation,
} from '@/hooks/use-dashboard-navigation';
import { usePathname } from '@/i18n/routing';
import { Sidebar, SidebarContent, SidebarFooter, SidebarRail } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { ShellNavigation } from '@/components/shell/shell-navigation';
import { SidebarBrand } from './sidebar-brand';
import { SidebarUserMenu } from './sidebar-user-menu';

const DIASPORA_LOCALE_QUERY_KEYS = ['country', 'origin', 'destination', 'transit'] as const;

function DashboardSidebarInner({
  user,
  role,
  memberItems,
  agentItems,
  adminItems,
}: Readonly<{
  user?: ClientShellUser | null;
  role?: string;
  memberItems: ReturnType<typeof buildDashboardNavigationModel>['memberItems'];
  agentItems: ReturnType<typeof buildDashboardNavigationModel>['agentItems'];
  adminItems: ReturnType<typeof buildDashboardNavigationModel>['adminItems'];
}>) {
  const pathname = usePathname();
  const isAgent = role === 'agent';
  const t = useTranslations('nav');

  return (
    <Sidebar
      collapsible="icon"
      className={`border-r transition-colors duration-500 ${
        isAgent
          ? 'border-white/10 bg-slate-950/40 backdrop-blur-2xl'
          : 'border-slate-200/80 bg-gradient-to-b from-slate-50/95 via-white/95 to-slate-100/95 backdrop-blur-xl'
      } supports-[backdrop-filter]:bg-transparent`}
    >
      <SidebarBrand role={role} />

      <SidebarContent className="mx-2 my-3 rounded-2xl border border-white/70 bg-white/70 px-2.5 py-3 group-data-[state=collapsed]:mx-0 group-data-[state=collapsed]:px-0 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.65)] backdrop-blur-xl">
        <ShellNavigation
          label={t('menu')}
          pathname={pathname}
          groups={[
            {
              id: 'primary',
              items: (isAgent ? agentItems : memberItems).slice(0, 1).map(item => ({
                ...item,
                exact: true,
              })),
            },
            {
              id: 'workspace',
              label: t(isAgent ? 'salesNetwork' : 'membershipSection'),
              items: (isAgent ? agentItems : memberItems).slice(1),
            },
            { id: 'admin', label: t('adminSection'), items: adminItems },
          ]}
        />
      </SidebarContent>

      <SidebarFooter className="m-2 rounded-xl border border-white/70 bg-white/70 p-2 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.7)] backdrop-blur-xl">
        <SidebarUserMenu
          retainedLocaleQueryKeys={
            pathname === '/member/diaspora' ? DIASPORA_LOCALE_QUERY_KEYS : undefined
          }
          user={user}
        />
      </SidebarFooter>
      <SidebarRail title={t('toggleSidebar')} aria-label={t('toggleSidebar')} />
    </Sidebar>
  );
}

function DashboardSidebarFromSession({ agentTier }: { agentTier?: string }) {
  const { memberItems, agentItems, adminItems, role } = useDashboardNavigation(agentTier);

  return (
    <DashboardSidebarInner
      role={role}
      memberItems={memberItems}
      agentItems={agentItems}
      adminItems={adminItems}
    />
  );
}

export function DashboardSidebar({
  agentTier = 'standard',
  user,
  adminAccess,
}: Readonly<{
  agentTier?: string;
  user?: ClientShellUser | null;
  adminAccess?: boolean;
}>) {
  const t = useTranslations('nav');

  if (user?.role !== undefined) {
    const navigation = buildDashboardNavigationModel({
      t,
      role: user.role,
      agentTier,
      adminAccess: adminAccess ?? false,
    });

    return (
      <DashboardSidebarInner
        user={user}
        role={navigation.role}
        memberItems={navigation.memberItems}
        agentItems={navigation.agentItems}
        adminItems={navigation.adminItems}
      />
    );
  }

  return <DashboardSidebarFromSession agentTier={agentTier} />;
}
