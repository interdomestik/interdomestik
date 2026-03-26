import { canAccessAdmin } from '@/actions/admin-access';
import { authClient } from '@/lib/auth-client';
import { isAdmin } from '@/lib/roles.core';
import {
  Briefcase,
  DollarSign,
  FilePlus,
  FileText,
  FolderOpen,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  Settings,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type IconType = typeof Home;
type Translator = (key: string) => string;

export type DashboardNavigationModel = {
  items: { title: string; href: string; icon: IconType }[];
  memberItems: { title: string; href: string; icon: IconType }[];
  agentItems: { title: string; href: string; icon: IconType }[];
  adminItems: { title: string; href: string; icon: IconType }[];
  role?: string;
};

export function buildDashboardNavigationModel(params: {
  t: Translator;
  role?: string;
  agentTier?: string;
  adminAccess?: boolean;
}): DashboardNavigationModel {
  const { t, role, agentTier = 'standard', adminAccess = false } = params;
  const isAgent = role === 'agent';

  const memberItems = isAgent
    ? []
    : [
        {
          title: t('overview'),
          href: '/member',
          icon: LayoutDashboard,
        },
        {
          title: t('claims'),
          href: '/member/claims',
          icon: FileText,
        },
        {
          title: t('documents'),
          href: '/member/documents',
          icon: FolderOpen,
        },
        {
          title: t('newClaim'),
          href: '/member/claims/new',
          icon: FilePlus,
        },
        {
          title: t('settings'),
          href: '/member/settings',
          icon: Settings,
        },
      ];

  // 2. Agent Sales Items (Only for agents)
  const agentItems: { title: string; href: string; icon: IconType }[] = [];
  if (isAgent) {
    agentItems.push(
      { title: t('agentHub'), href: '/agent', icon: Home },
      { title: t('members'), href: '/agent/members', icon: Users },
      { title: t('trackClaims'), href: '/agent/claims', icon: FileText },
      { title: t('rapidPos'), href: '/agent/pos', icon: UserPlus }
    );

    // Tier Gating: Leads only for Pro/Office
    if (['pro', 'office'].includes(agentTier)) {
      agentItems.push({ title: t('agentLeads'), href: '/agent/leads', icon: Users });
    }

    agentItems.push(
      { title: t('clients'), href: '/agent/clients', icon: Briefcase },
      { title: t('agentCommissions'), href: '/agent/commissions', icon: DollarSign }
    );

    // Tier Gating: Bulk Import only for Office
    if (agentTier === 'office') {
      agentItems.push({ title: t('bulkImport'), href: '/agent/import', icon: Upload });
    }
  }

  const adminItems: { title: string; href: string; icon: IconType }[] = [];
  if (isAdmin(role) || adminAccess) {
    adminItems.push({
      title: t('adminDashboard'),
      href: '/admin/overview',
      icon: LayoutTemplate,
    });
  }

  const items = [...memberItems, ...agentItems, ...adminItems];

  return { items, memberItems, agentItems, adminItems, role };
}

export function useDashboardNavigation(agentTier: string = 'standard') {
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [adminAccess, setAdminAccess] = useState(false);

  useEffect(() => {
    if (!role) return;
    if (isAdmin(role)) {
      setAdminAccess(true);
      return;
    }

    let cancelled = false;
    canAccessAdmin()
      .then(ok => {
        if (!cancelled) setAdminAccess(ok);
      })
      .catch(() => {
        // Ignore
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  return buildDashboardNavigationModel({ t, role, agentTier, adminAccess });
}
