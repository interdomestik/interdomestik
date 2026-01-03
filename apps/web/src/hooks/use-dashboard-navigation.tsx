import { canAccessAdmin } from '@/actions/admin-access';
import { authClient } from '@/lib/auth-client';
import { isAdmin } from '@/lib/roles.core';
import {
  FilePlus,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LayoutTemplate,
  Phone,
  Settings,
  Shield,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * Navigation for the Member Portal (/member)
 * Agents use AgentSidebar, Staff use StaffSidebar, Admin use AdminSidebar
 */
export function useDashboardNavigation() {
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [adminAccess, setAdminAccess] = useState(false);

  useEffect(() => {
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
        // Ignore; keep adminAccess false.
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  // Member dashboard navigation items
  const memberItems = [
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
      title: t('consumerRights'),
      href: '/member/rights',
      icon: Shield,
    },
    {
      title: t('settings'),
      href: '/member/settings',
      icon: Settings,
    },
    {
      title: t('help'),
      href: '/member/help',
      icon: Phone,
    },
  ];

  // Admin gets a link to admin dashboard
  const items = [...memberItems];
  if (isAdmin(role) || adminAccess) {
    items.push({
      title: t('adminDashboard'),
      href: '/admin',
      icon: LayoutTemplate,
    });
  }

  return { items, role };
}
