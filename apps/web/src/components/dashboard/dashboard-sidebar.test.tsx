import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSidebar } from './dashboard-sidebar';

// Mock the useDashboardNavigation hook
vi.mock('@/hooks/use-dashboard-navigation', () => ({
  useDashboardNavigation: vi.fn(),
}));

import { useDashboardNavigation } from '@/hooks/use-dashboard-navigation';
const mockUseDashboardNavigation = vi.mocked(useDashboardNavigation);

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      overview: 'Overview',
      claims: 'Claims',
      documents: 'Documents',
      newClaim: 'New Claim',
      consumerRights: 'Consumer Rights',
      settings: 'Settings',
      help: 'Help',
      menu: 'Menu',
      agentCrm: 'CRM',
      agentLeads: 'Leads',
      agentWorkspace: 'Workspace',
      adminDashboard: 'Admin Dashboard',
    };
    return translations[key] || key;
  },
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/en/member',
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid="sidebar">{children}</aside>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <div>{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarRail: () => <div data-testid="sidebar-rail" />,
}));

// Mock child components
vi.mock('./sidebar-brand', () => ({
  SidebarBrand: ({ role }: { role?: string }) => (
    <div data-testid="sidebar-brand">Interdomestik ({role || 'user'})</div>
  ),
}));

vi.mock('./sidebar-user-menu', () => ({
  SidebarUserMenu: () => <div data-testid="sidebar-user-menu">User Menu</div>,
}));

// Create a simple mock icon component - cast to any to bypass LucideIcon type constraints
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockIcon: any = () => <span data-testid="icon">Icon</span>;

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sidebar with member menu items for regular users', () => {
    mockUseDashboardNavigation.mockReturnValue({
      items: [
        { title: 'Overview', href: '/member', icon: MockIcon },
        { title: 'Claims', href: '/member/claims', icon: MockIcon },
        { title: 'Documents', href: '/member/documents', icon: MockIcon },
        { title: 'New Claim', href: '/member/claims/new', icon: MockIcon },
        { title: 'Consumer Rights', href: '/member/rights', icon: MockIcon },
        { title: 'Settings', href: '/member/settings', icon: MockIcon },
        { title: 'Help', href: '/member/help', icon: MockIcon },
      ],
      role: 'user',
    });

    render(<DashboardSidebar />);

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('New Claim')).toBeInTheDocument();
    expect(screen.getByText('Consumer Rights')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('renders agent menu items for agent role', () => {
    mockUseDashboardNavigation.mockReturnValue({
      items: [
        { title: 'Workspace', href: '/agent', icon: MockIcon },
        { title: 'CRM', href: '/agent/crm', icon: MockIcon },
        { title: 'Leads', href: '/agent/leads', icon: MockIcon },
        { title: 'Settings', href: '/agent/settings', icon: MockIcon },
        { title: 'Help', href: '/agent/help', icon: MockIcon },
      ],
      role: 'agent',
    });

    render(<DashboardSidebar />);

    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
    // Should not show member-specific items
    expect(screen.queryByText('Documents')).not.toBeInTheDocument();
    expect(screen.queryByText('Consumer Rights')).not.toBeInTheDocument();
  });

  it('renders admin menu items for admin role', () => {
    mockUseDashboardNavigation.mockReturnValue({
      items: [
        { title: 'Overview', href: '/member', icon: MockIcon },
        { title: 'Claims', href: '/member/claims', icon: MockIcon },
        { title: 'Admin Dashboard', href: '/admin', icon: MockIcon },
      ],
      role: 'admin',
    });

    render(<DashboardSidebar />);

    // Admin sees member items plus admin dashboard
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('renders brand logo and name', () => {
    mockUseDashboardNavigation.mockReturnValue({
      items: [{ title: 'Overview', href: '/member', icon: MockIcon }],
      role: 'user',
    });

    render(<DashboardSidebar />);

    expect(screen.getByTestId('sidebar-brand')).toBeInTheDocument();
  });

  it('renders menu label', () => {
    mockUseDashboardNavigation.mockReturnValue({
      items: [{ title: 'Overview', href: '/member', icon: MockIcon }],
      role: 'user',
    });

    render(<DashboardSidebar />);

    expect(screen.getByText('Menu')).toBeInTheDocument();
  });

  it('handles null session gracefully', () => {
    mockUseDashboardNavigation.mockReturnValue({
      items: [
        { title: 'Overview', href: '/member', icon: MockIcon },
        { title: 'Claims', href: '/member/claims', icon: MockIcon },
      ],
      role: undefined,
    });

    render(<DashboardSidebar />);

    // Should render member items by default when no role
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
  });
});
