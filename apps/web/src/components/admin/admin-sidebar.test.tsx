import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from './admin-sidebar';
import { AdminRoleShell } from '@/components/shell/admin-role-shell';
import type { RoleShell } from '@/components/shell/role-shell';

const hoisted = vi.hoisted(() => ({
  shellProps: [] as ComponentProps<typeof RoleShell>[],
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/components/shell/role-shell', () => ({
  RoleShell: (props: ComponentProps<typeof RoleShell>) => {
    hoisted.shellProps.push(props);
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
  useSearchParams: hoisted.searchParamsMock,
}));

// Mock auth client
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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

describe('AdminSidebar', () => {
  it('renders user information', () => {
    render(
      <AdminSidebar
        user={{
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }}
      />
    );

    expect(screen.getByRole('button', { name: /Admin User/ })).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it.each([
    ['admin', '/admin/account'],
    ['tenant_admin', '/admin/account'],
    ['super_admin', '/admin/account'],
    ['branch_manager', '/staff/settings'],
  ])('links %s to its own profile page from the account menu', (role, href) => {
    render(<AdminSidebar user={{ name: 'Account User', email: 'a@example.com', role }} />);

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', href);
  });

  it('localizes the sidebar account role label', () => {
    render(
      <AdminSidebar
        user={{
          name: 'Tenant Admin',
          email: 'tenant-admin@example.com',
          role: 'tenant_admin',
        }}
      />
    );

    expect(screen.getByText('Tenant administrator')).toBeInTheDocument();
    expect(screen.queryByText('tenant_admin')).not.toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <AdminSidebar
        user={{
          name: 'Admin',
          email: 'admin@test.com',
          role: 'admin',
        }}
      />
    );

    // Check that sidebar navigation items are rendered
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('CRM Reporting')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders the CRM reporting link for branch managers only with branch scope', () => {
    const { rerender } = render(
      <AdminSidebar
        user={{
          branchId: 'branch-1',
          name: 'Branch Manager',
          email: 'manager@test.com',
          role: 'branch_manager',
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'CRM Reporting' })).toHaveAttribute(
      'href',
      '/admin/crm'
    );

    rerender(
      <AdminSidebar
        user={{
          branchId: null,
          name: 'Branch Manager',
          email: 'manager@test.com',
          role: 'branch_manager',
        }}
      />
    );

    expect(screen.queryByRole('link', { name: 'CRM Reporting' })).not.toBeInTheDocument();
  });

  it('only preserves tenant context in sidebar links', () => {
    hoisted.searchParamsMock.mockReturnValue(
      new URLSearchParams('view=history&query=mimoza&role=admin,staff&tenantId=tenant_ks')
    );

    render(
      <AdminSidebar
        user={{
          name: 'Admin',
          email: 'admin@test.com',
          role: 'admin',
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/admin/overview?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'Claims' })).toHaveAttribute(
      'href',
      '/admin/claims?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'Payment Verification' })).toHaveAttribute(
      'href',
      '/admin/leads?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'CRM Reporting' })).toHaveAttribute(
      'href',
      '/admin/crm?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('data-prefetch', 'true');
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('data-prefetch', 'true');
    for (const name of ['Staff', 'Claims', 'Dashboard', 'Payment Verification']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('data-prefetch');
    }
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Agents' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Members' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute(
      'href',
      '/admin/users?tenantId=tenant_ks&role=admin%2Cstaff'
    );
  });
});

describe('AdminRoleShell adapter', () => {
  it.each(['admin', 'tenant_admin', 'super_admin', 'branch_manager'])(
    'keeps %s navigation decisions in a drawer with persistent title and account',
    role => {
      hoisted.searchParamsMock.mockReturnValue(
        new URLSearchParams('tenantId=tenant_ks&role=agent&search=private')
      );
      hoisted.shellProps.length = 0;
      render(
        <AdminRoleShell
          user={{ role, branchId: null, name: 'Operator', email: 'operator@example.com' }}
          tenantSelector={null}
        >
          <p>Existing claim</p>
        </AdminRoleShell>
      );
      expect(screen.getByRole('heading', { name: 'Admin Panel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Operator/ })).toBeInTheDocument();
      expect(screen.getByText('Existing claim')).toBeInTheDocument();
      const props = hoisted.shellProps.at(-1)!;
      expect(props.mobileNavigation).toBe('drawer');
      expect(props.sidebarAccount).toBeTruthy();
      expect(props.items.every(item => !item.href.includes('search='))).toBe(true);
      expect(props.items.find(item => item.title === 'Agents')).toMatchObject({ selected: true });
      const paths = props.items.map(item => item.href.split('?')[0]);
      expect(paths.includes('/admin/branches')).toBe(role !== 'branch_manager');
      expect(paths.includes('/admin/crm')).toBe(role !== 'branch_manager');
      expect(paths.includes('/admin/sponsors')).toBe(role !== 'branch_manager');
      expect(paths).toContain('/admin/claims');
    }
  );
});
