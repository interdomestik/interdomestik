import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardSidebar } from './dashboard-sidebar';

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
  },
}));

// Get the mock reference
import { authClient } from '@/lib/auth-client';
const mockUseSession = vi.mocked(authClient.useSession);

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
  usePathname: () => '/en/dashboard',
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid="sidebar">{children}</aside>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
  SidebarMenuButton: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div>{asChild ? children : <button>{children}</button>}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarRail: () => <div data-testid="sidebar-rail" />,
}));

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sidebar with member menu items for regular users', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user1', name: 'Test User', role: 'user' } },
      isPending: false,
      error: null,
    } as ReturnType<typeof authClient.useSession>);

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
    mockUseSession.mockReturnValue({
      data: { user: { id: 'agent1', name: 'Test Agent', role: 'agent' } },
      isPending: false,
      error: null,
    } as ReturnType<typeof authClient.useSession>);

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
    mockUseSession.mockReturnValue({
      data: { user: { id: 'admin1', name: 'Test Admin', role: 'admin' } },
      isPending: false,
      error: null,
    } as ReturnType<typeof authClient.useSession>);

    render(<DashboardSidebar />);

    // Admin sees member items plus admin dashboard
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('renders brand logo and name', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user1', name: 'Test User', role: 'user' } },
      isPending: false,
      error: null,
    } as ReturnType<typeof authClient.useSession>);

    render(<DashboardSidebar />);

    expect(screen.getByText('Interdomestik')).toBeInTheDocument();
  });

  it('renders menu label', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user1', name: 'Test User', role: 'user' } },
      isPending: false,
      error: null,
    } as ReturnType<typeof authClient.useSession>);

    render(<DashboardSidebar />);

    expect(screen.getByText('Menu')).toBeInTheDocument();
  });

  it('handles null session gracefully', () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as ReturnType<typeof authClient.useSession>);

    render(<DashboardSidebar />);

    // Should render member items by default when no role
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
  });
});
