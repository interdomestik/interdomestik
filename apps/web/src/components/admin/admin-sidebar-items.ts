import { ROLES } from '@interdomestik/shared-auth';
import {
  Banknote,
  BarChart,
  Briefcase,
  FileText,
  GitBranch,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
} from 'lucide-react';

type SidebarItem = {
  title: string;
  href: string;
  icon: typeof Shield;
  hidden?: boolean;
  peopleKey?: string;
};

export function adminSidebarItems(role: string, branchId?: string | null): SidebarItem[] {
  return [
    {
      title: 'dashboard',
      href: '/admin/overview',
      icon: LayoutDashboard,
    },
    {
      title: 'branches',
      href: '/admin/branches',
      icon: GitBranch,
      hidden: !([ROLES.super_admin, ROLES.tenant_admin, ROLES.admin] as string[]).includes(role),
    },
    {
      title: 'claims',
      href: '/admin/claims',
      icon: FileText,
    },
    {
      title: 'leads',
      href: '/admin/leads',
      icon: Banknote,
    },
    {
      title: 'sponsors',
      href: '/admin/sponsors',
      icon: Briefcase,
      hidden:
        !([ROLES.super_admin, ROLES.tenant_admin, ROLES.admin] as string[]).includes(role) &&
        !(role === ROLES.branch_manager && branchId),
    },
    {
      title: 'crm',
      href: '/admin/crm',
      icon: BarChart,
      hidden:
        !([ROLES.super_admin, ROLES.tenant_admin, ROLES.admin] as string[]).includes(role) &&
        !(role === ROLES.branch_manager && branchId),
    },
    {
      title: 'members',
      href: '/admin/users',
      icon: Users,
      peopleKey: 'members',
    },
    {
      title: 'agents',
      href: '/admin/users?role=agent',
      icon: Briefcase,
      peopleKey: 'agents',
    },
    {
      title: 'staff',
      href: '/admin/users?role=admin,staff',
      icon: Shield,
      peopleKey: 'staff',
    },
    {
      title: 'analytics',
      href: '/admin/analytics',
      icon: BarChart,
    },
    {
      title: 'settings',
      href: '/admin/settings',
      icon: Settings,
      peopleKey: undefined,
    },
  ].filter(item => !item.hidden);
}
