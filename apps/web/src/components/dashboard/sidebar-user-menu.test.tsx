import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updatePreferredLocale } from '@/actions/preferred-locale';
import { authClient } from '@/lib/auth-client';
import { signOutAndRedirectToLogin } from '@/lib/auth/logout';
import { SidebarUserMenu } from './sidebar-user-menu';

const mockSignOutAndRedirectToLogin = vi.mocked(signOutAndRedirectToLogin);
const replaceMock = vi.fn();
let pathnameMock = '/member/diaspora';

vi.mock('@/actions/preferred-locale', () => ({
  updatePreferredLocale: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => pathnameMock,
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn().mockReturnValue({
      data: {
        user: {
          name: 'Agent User',
          email: 'agent.ks.a1@plan070.example.invalid',
          role: 'agent',
          image: null,
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>),
    signOut: vi.fn(),
  },
}));

vi.mock('@/lib/auth/logout', () => ({
  signOutAndRedirectToLogin: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'common') {
      const common: Record<string, string> = {
        'roles.agent': 'Agjent',
        'roles.member': 'Anëtar',
      };

      return common[key] ?? key;
    }

    return key;
  },
}));

vi.mock('@interdomestik/ui', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => <div />,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    asChild,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
  }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuPortal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  Check: () => <span />,
  ChevronUp: () => <span />,
  Globe: () => <span />,
  Home: () => <span />,
  LogOut: () => <span />,
  User: () => <span />,
}));

describe('SidebarUserMenu', () => {
  beforeEach(() => {
    pathnameMock = '/member/diaspora';
    replaceMock.mockClear();
    vi.mocked(toast.error).mockClear();
    window.history.replaceState({}, '', '/?origin=DE&destination=IT&transit=AT&transit=CH');
  });

  it('preserves ordered repeated query values when switching locale', async () => {
    render(
      <SidebarUserMenu retainedLocaleQueryKeys={['country', 'origin', 'destination', 'transit']} />
    );

    fireEvent.click(screen.getByRole('button', { name: /English/i }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        '/member/diaspora?origin=DE&destination=IT&transit=AT&transit=CH',
        { locale: 'en' }
      )
    );
    expect(updatePreferredLocale).toHaveBeenCalledWith({ locale: 'en' });
  });

  it('keeps the pathname-only locale switch when no query is present', async () => {
    window.history.replaceState({}, '', '/');
    render(<SidebarUserMenu retainedLocaleQueryKeys={['origin', 'destination', 'transit']} />);

    fireEvent.click(screen.getByRole('button', { name: /English/i }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/member/diaspora', { locale: 'en' })
    );
  });

  it('stays on the current page and shows an error when the locale save request rejects', async () => {
    vi.mocked(updatePreferredLocale).mockRejectedValueOnce(new Error('Network unavailable'));
    render(<SidebarUserMenu />);

    fireEvent.click(screen.getByRole('button', { name: /English/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('localeSaveError'));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not forward query state from other role routes', async () => {
    pathnameMock = '/admin/users';
    render(<SidebarUserMenu />);

    fireEvent.click(screen.getByRole('button', { name: /English/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin/users', { locale: 'en' }));
  });

  it('signs out with a localized hard redirect for agent users', async () => {
    pathnameMock = '/agent';
    render(<SidebarUserMenu />);

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(mockSignOutAndRedirectToLogin).toHaveBeenCalledWith({
        locale: 'sq',
        signOut: authClient.signOut,
      });
    });
  });

  it('does not subscribe to session when user is provided explicitly', () => {
    const useSessionSpy = vi.mocked(authClient.useSession);

    render(
      <SidebarUserMenu
        user={{
          name: 'Provided User',
          email: 'provided@plan070.example.invalid',
          role: 'agent',
          image: null,
        }}
      />
    );

    expect(useSessionSpy).not.toHaveBeenCalled();
  });

  it('localizes the member role label instead of showing the raw session role', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: {
        user: {
          name: 'Member User',
          email: 'member.mk.1@plan070.example.invalid',
          role: 'member',
          image: null,
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<SidebarUserMenu />);

    expect(screen.getByText('Anëtar')).toBeInTheDocument();
    expect(screen.queryByText(/^member$/)).not.toBeInTheDocument();
  });

  it('localizes non-member role labels instead of showing raw backend roles', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: {
        user: {
          name: 'Agent User',
          email: 'agent.ks.a1@plan070.example.invalid',
          role: 'agent',
          image: null,
        },
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<SidebarUserMenu />);

    expect(screen.getByText('Agjent')).toBeInTheDocument();
    expect(screen.queryByText(/^agent$/)).not.toBeInTheDocument();
  });

  it('renders the supplied profile destination without adding a default profile control', () => {
    const { rerender } = render(<SidebarUserMenu profileHref="/admin/account" />);
    expect(screen.getByRole('link', { name: 'profile' })).toHaveAttribute('href', '/admin/account');
    rerender(<SidebarUserMenu />);
    expect(screen.queryByRole('link', { name: 'profile' })).not.toBeInTheDocument();
  });
});
