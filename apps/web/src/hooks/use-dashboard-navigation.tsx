import { authClient } from '@/lib/auth-client';
import {
  BarChart3,
  Briefcase,
  FilePlus,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LayoutTemplate,
  Phone,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export function useDashboardNavigation() {
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const memberItems = [
    {
      title: t('overview'),
      href: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: t('claims'),
      href: '/dashboard/claims',
      icon: FileText,
    },
    {
      title: t('documents'),
      href: '/dashboard/documents',
      icon: FolderOpen,
    },
    {
      title: t('newClaim'),
      href: '/dashboard/claims/new',
      icon: FilePlus,
    },
    {
      title: t('consumerRights'),
      href: '/dashboard/rights',
      icon: Shield,
    },
    {
      title: t('settings'),
      href: '/dashboard/settings',
      icon: Settings,
    },
    {
      title: t('help'),
      href: '/dashboard/help',
      icon: Phone,
    },
  ];

  const agentItems = [
    {
      title: t('agentCrm'),
      href: '/agent/crm',
      icon: BarChart3,
    },
    {
      title: t('agentLeads'),
      href: '/agent/leads',
      icon: Users,
    },
    {
      title: t('agentWorkspace'),
      href: '/agent/claims',
      icon: Briefcase,
    },
    {
      title: t('settings'),
      href: '/dashboard/settings',
      icon: Settings,
    },
    {
      title: t('help'),
      href: '/dashboard/help',
      icon: Phone,
    },
  ];

  let items = [...memberItems];

  if (role === 'agent') {
    items = agentItems;
  } else if (role === 'admin') {
    items.push({
      title: t('adminDashboard'),
      href: '/admin',
      icon: LayoutTemplate,
    });
  }

  return { items, role };
}
