import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from './admin-sidebar';

const hoisted = vi.hoisted(() => ({
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

// Mock next-intl hooks
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        'roles.admin': 'Administrator',
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
        analytics: 'Analytics',
        settings: 'Settings',
      },
      nav: {
        myAccount: 'My Account',
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
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/en/admin',
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

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
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
    expect(screen.getByText('Analytics')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute(
      'href',
      '/admin/users?tenantId=tenant_ks&role=admin%2Cstaff'
    );
  });
});
