import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserNav } from './user-nav';

vi.mock('@/actions/admin-access', () => ({
  canAccessAdmin: vi.fn(async () => false),
}));

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';
const mockUseSession = vi.mocked(authClient.useSession);

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
  beforeEach(() => {
    vi.clearAllMocks();
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
});
