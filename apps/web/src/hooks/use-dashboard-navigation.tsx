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

  const isAgent = role === 'agent';

  // 1. Personal Membership / Protection Items
  const memberItems = isAgent
    ? [
        {
          title: 'Member Hub',
          href: '/agent/workspace',
          icon: LayoutDashboard,
        },
        {
          title: t('documents'),
          href: '/agent/members',
          icon: FolderOpen,
        },
        {
          title: t('newClaim'),
          href: '/agent/claims',
          icon: FilePlus,
        },
        {
          title: t('settings'),
          href: '/agent/settings',
          icon: Settings,
        },
      ]
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
      { title: 'Agent Hub', href: '/agent', icon: Home },
      { title: 'My Members', href: '/agent/members', icon: Users },
      { title: t('trackClaims'), href: '/agent/claims', icon: FileText },
      { title: 'Rapid POS', href: '/agent/pos', icon: UserPlus }
    );

    // Tier Gating: Leads only for Pro/Office
    if (['pro', 'office'].includes(agentTier)) {
      agentItems.push({ title: 'Leads', href: '/agent/leads', icon: Users });
    }

    agentItems.push(
      { title: 'Clients', href: '/agent/clients', icon: Briefcase },
      { title: 'Commissions', href: '/agent/commissions', icon: DollarSign }
    );

    // Tier Gating: Bulk Import only for Office
    if (agentTier === 'office') {
      agentItems.push({ title: 'Bulk Import', href: '/agent/import', icon: Upload });
    }
  }

  // 3. Admin Items
  const adminItems = [];
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
