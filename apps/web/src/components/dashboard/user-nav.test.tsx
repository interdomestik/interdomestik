import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserNav } from './user-nav';

vi.mock('@/actions/admin-access', () => ({
  canAccessAdmin: vi.fn(async () => false),
}));

vi.mock('@interdomestik/ui', async importOriginal => {
  const React = await import('react');
  const actual = await importOriginal<typeof import('@interdomestik/ui')>();

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: React.ReactElement;
    }) =>
      asChild && React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            'aria-haspopup': 'menu',
          })
        : children,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
      asChild,
      children,
      onClick,
      className,
    }: {
      asChild?: boolean;
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
    }) =>
      asChild ? (
        <>{children}</>
      ) : (
        <button onClick={onClick} className={className}>
          {children}
        </button>
      ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';
const mockUseSession = vi.mocked(authClient.useSession);
import { canAccessAdmin } from '@/actions/admin-access';
const mockCanAccessAdmin = vi.mocked(canAccessAdmin);

// Mock router
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      profile: 'Profile',
      settings: 'Settings',
      adminDashboard: 'Admin Dashboard',
      agentWorkspace: 'Agent Workspace',
      logout: 'Log out',
    };
    return translations[key] || key;
  },
}));

describe('UserNav', () => {
  const openMenuAndGetSettingsLink = async () => {
    const navButton = await screen.findByTestId('user-nav');
    fireEvent.mouseDown(navButton);
    fireEvent.click(navButton);
    const settingsLabel = await screen.findByText('Settings');
    return settingsLabel.closest('a');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessAdmin.mockResolvedValue(false);
  });

  it('renders disabled avatar when no session', () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    // Should show disabled button with placeholder
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('renders user avatar with initial after mount', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          role: 'user',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    // Wait for mount effect
    await waitFor(() => {
      expect(screen.getByTestId('user-nav')).toBeInTheDocument();
    });

    // User initial should be shown in fallback
    await waitFor(() => {
      expect(screen.getByText('T')).toBeInTheDocument();
    });
  });

  it('renders avatar button for authenticated user', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          role: 'user',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    await waitFor(() => {
      const navButton = screen.getByTestId('user-nav');
      expect(navButton).toBeInTheDocument();
      expect(navButton).not.toBeDisabled();
    });
  });

  it('displays user initial when no image', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          name: 'Alice User',
          email: 'alice@example.com',
          image: null,
          role: 'user',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  it('handles user with no name gracefully', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          name: null,
          email: 'user@example.com',
          image: null,
          role: 'user',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    await waitFor(() => {
      expect(screen.getByText('U')).toBeInTheDocument();
    });
  });

  it('renders dropdown trigger with correct attributes', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'admin-1',
          name: 'Admin User',
          email: 'admin@example.com',
          image: null,
          role: 'admin',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    await waitFor(() => {
      const button = screen.getByTestId('user-nav');
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
    });
  });

  it('routes Settings to member settings for member role', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'member-1',
          name: 'Member User',
          email: 'member@example.com',
          image: null,
          role: 'member',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    expect(await openMenuAndGetSettingsLink()).toHaveAttribute('href', '/member/settings');
  });

  it('routes Settings to agent settings for agent role without admin access', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'agent-1',
          name: 'Agent User',
          email: 'agent@example.com',
          image: null,
          role: 'agent',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    expect(await openMenuAndGetSettingsLink()).toHaveAttribute('href', '/agent/settings');
  });

  it('routes Settings to admin settings when adminAccess is granted for agent role', async () => {
    mockCanAccessAdmin.mockResolvedValue(true);
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'agent-1',
          name: 'Agent User',
          email: 'agent@example.com',
          image: null,
          role: 'agent',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    await waitFor(async () => {
      expect(await openMenuAndGetSettingsLink()).toHaveAttribute('href', '/admin/settings');
    });
  });

  it('routes Settings to admin settings for admin role', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'admin-1',
          name: 'Admin User',
          email: 'admin@example.com',
          image: null,
          role: 'admin',
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserNav />);

    expect(await openMenuAndGetSettingsLink()).toHaveAttribute('href', '/admin/settings');
  });
});
