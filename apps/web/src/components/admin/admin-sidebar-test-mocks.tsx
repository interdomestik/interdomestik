import type { ComponentProps } from 'react';
import { vi } from 'vitest';
import type { RoleShell } from '@/components/shell/role-shell';

const sidebarTestState = vi.hoisted(() => ({
  shellProps: [] as ComponentProps<typeof RoleShell>[],
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

export function getSidebarTestState(): typeof sidebarTestState {
  return sidebarTestState;
}

vi.mock('@/components/shell/role-shell', () => ({
  RoleShell: (props: ComponentProps<typeof RoleShell>) => {
    sidebarTestState.shellProps.push(props);
    return (
      <>
        {props.context}
        {props.account}
        {props.children}
      </>
    );
  },
}));
vi.mock('@/components/dashboard/portal-surface-indicator', () => ({
  PortalSurfaceIndicator: () => null,
}));

// Mock next-intl hooks
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        'roles.admin': 'Administrator',
        'roles.branch_manager': 'Branch manager',
        'roles.tenant_admin': 'Tenant administrator',
      },
      'admin.sidebar': {
        title: 'Admin Panel',
        subtitle: 'Control Center',
        dashboard: 'Dashboard',
        branches: 'Branches',
        claims: 'Claims',
        leads: 'Payment Verification',
        members: 'Members',
        agents: 'Agents',
        staff: 'Staff',
        crm: 'CRM Reporting',
        analytics: 'Analytics',
        settings: 'Settings',
      },
      nav: {
        myAccount: 'My Account',
        profile: 'Profile',
        language: 'Language',
        backToWebsite: 'Back to Website',
        logout: 'Logout',
      },
    };
    return translations[namespace]?.[key] || key;
  },
  useLocale: () => 'en',
}));

vi.mock('@/lib/roles-i18n', () => ({
  getRoleLabel: (translator: (key: string) => string, role: string, fallback?: string) =>
    translator(`roles.${role}`) ?? fallback ?? role,
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={prefetch === undefined ? undefined : String(prefetch)} />
  ),
  usePathname: () => '/admin/users',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: sidebarTestState.searchParamsMock,
}));

// Mock auth client
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Avatar: ({ children }: Readonly<{ children: React.ReactNode }>) => <span>{children}</span>,
  AvatarFallback: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <span>{children}</span>
  ),
  AvatarImage: () => null,
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuPortal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid="sidebar">{children}</aside>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarRail: () => <div data-testid="sidebar-rail" />,
}));
