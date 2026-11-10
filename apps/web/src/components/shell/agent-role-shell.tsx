'use client';

import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { buildDashboardNavigationModel } from '@/hooks/use-dashboard-navigation';
import { usePathname } from '@/i18n/routing';
import { FileText, LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ClientShellUser } from './client-shell-user';
import { RoleShell } from './role-shell';
import { useDashboardShellSlots } from './dashboard-shell-slots';

const PRIMARY_PATHS = new Set(['/agent', '/agent/members', '/agent/claims']);
const CASE_QUERY_KEYS = ['claimId', 'selected'] as const;

export function AgentRoleShell({
  children,
  user,
  agentTier,
}: Readonly<{ children: ReactNode; user: ClientShellUser; agentTier: string }>): ReactNode {
  const t = useTranslations('nav');
  const tAgent = useTranslations('agent');
  const tBottom = useTranslations('dashboard.member_assistance.bottomNav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const slots = useDashboardShellSlots(user);
  const { agentItems } = buildDashboardNavigationModel({
    t,
    role: user.role,
    agentTier,
    adminAccess: false,
  });
  const items = [
    ...agentItems.map(item => ({ ...item, exact: item.href === '/agent' })),
    {
      title: tAgent('workspace.title'),
      href: '/agent/workspace',
      icon: LayoutDashboard,
      exact: true,
    },
    { title: tAgent('claimsPro.title'), href: '/agent/workspace/claims', icon: FileText },
  ].map(item => {
    if (item.href !== pathname || !query) return item;
    return { ...item, href: `${item.href}?${query}` };
  });
  const primaryItems = items.filter(item => PRIMARY_PATHS.has(item.href.split('?')[0]));

  return (
    <RoleShell
      {...slots}
      items={items}
      primaryItems={primaryItems}
      pathname={pathname}
      labels={{
        navigation: t('salesNetwork'),
        more: tBottom('more'),
        close: tCommon('cancel'),
        menu: t('menu'),
        toggleSidebar: t('toggleSidebar'),
      }}
      sidebarAccount={
        <SidebarUserMenu
          user={user}
          retainedLocaleQueryKeys={
            pathname === '/agent/workspace/claims' ? CASE_QUERY_KEYS : undefined
          }
        />
      }
    >
      <div className="min-w-0 space-y-6 p-4 md:p-0">{children}</div>
    </RoleShell>
  );
}
