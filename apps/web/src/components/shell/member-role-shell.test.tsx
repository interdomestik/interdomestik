import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberRoleShell } from './member-role-shell';

const state = vi.hoisted(() => ({
  pathname: '/member',
  signOut: vi.fn(),
  logout: vi.fn(),
  useSession: vi.fn(),
  canAccessAdmin: vi.fn(),
}));
vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/actions/admin-access', () => ({ canAccessAdmin: state.canAccessAdmin }));
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: state.useSession, signOut: state.signOut },
}));
vi.mock('@/lib/auth/logout', () => ({ signOutAndRedirectToLogin: state.logout }));
vi.mock('@/components/notifications', () => ({
  NotificationBell: () => <button>Notifications</button>,
}));
vi.mock('@/components/dashboard/command-menu-trigger', () => ({
  CommandMenuTrigger: () => <button>Search</button>,
}));
vi.mock('@/components/dashboard/portal-surface-indicator', () => ({
  PortalSurfaceIndicator: () => <span>Member portal</span>,
}));

const mount = () =>
  render(
    <MemberRoleShell
      user={{ id: 'member-1', role: 'member', name: 'Member One', email: 'member@example.com' }}
    >
      <div data-testid="member-dashboard-ready">Unchanged portal slots</div>
    </MemberRoleShell>
  );

beforeEach(() => {
  state.pathname = '/member';
  vi.clearAllMocks();
});

describe('MemberRoleShell', () => {
  it('preserves the mobile sidebar trigger, drawer attributes and footer logout helper contract', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    const triggers = container.querySelectorAll('button[data-sidebar="trigger"]');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toHaveAccessibleName('toggleSidebar');
    await user.click(triggers[0]);
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-sidebar', 'sidebar');
    expect(drawer).toHaveAttribute('data-mobile', 'true');
    expect(drawer).toHaveAttribute('data-state', 'open');
    expect(within(drawer).getByRole('navigation', { name: 'menu' })).toBeInTheDocument();
    expect(within(drawer).getAllByRole('link')).toHaveLength(7);
    const footer = drawer.querySelector(
      '[data-sidebar="footer"] button[data-sidebar="menu-button"]'
    );
    expect(footer).toHaveAttribute('data-testid', 'sidebar-user-menu-button');
    await user.click(footer as HTMLButtonElement);
    const menu = screen.getByRole('menu');
    const rows = within(menu).getAllByRole('menuitem');
    expect(rows.at(-1)).toHaveTextContent('logout');
    await user.click(rows.at(-1)!);
    expect(state.logout).toHaveBeenCalledWith({ locale: 'sq', signOut: state.signOut });
  });

  it('mounts the configured Home, Claims, Help and Documents tabs and preserves children', async () => {
    mount();
    const nav = screen.getByTestId('role-shell-bottom-nav');
    expect(
      within(nav)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/member', '/member/claims', '/member/help', '/member/documents']);
    expect(screen.getByTestId('member-dashboard-ready')).toHaveTextContent(
      'Unchanged portal slots'
    );
    expect(await screen.findByTestId('user-nav')).toBeInTheDocument();
    expect(state.useSession).not.toHaveBeenCalled();
    expect(state.canAccessAdmin).not.toHaveBeenCalled();
  });

  it('keeps settings, membership, language and the existing logout control reachable through More', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'more' }));
    const dialog = screen.getByRole('dialog', { name: 'more' });
    expect(within(dialog).getByRole('link', { name: 'membershipSection' })).toHaveAttribute(
      'href',
      '/member/membership'
    );
    expect(within(dialog).getByRole('link', { name: 'settings' })).toHaveAttribute(
      'href',
      '/member/settings'
    );
    expect(within(dialog).getByRole('link', { name: 'newClaim' })).toHaveAttribute(
      'href',
      '/member/claims/new'
    );
    await user.click(within(dialog).getByTestId('sidebar-user-menu-button'));
    expect(await screen.findByRole('menuitem', { name: /language/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'logout' })).toHaveClass('min-h-11');
    await user.click(screen.getByRole('menuitem', { name: 'logout' }));
    expect(state.logout).toHaveBeenCalledWith({ locale: 'sq', signOut: state.signOut });
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it('retains the header account menu, profile/settings destinations and logout', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByTestId('user-nav'));
    expect(await screen.findByRole('menuitem', { name: /profile/ })).toHaveAttribute(
      'href',
      '/member/settings'
    );
    expect(screen.getByRole('menuitem', { name: /settings/ })).toHaveAttribute(
      'href',
      '/member/settings'
    );
    expect(screen.getByRole('menuitem', { name: /logout/ })).toHaveClass('min-h-11');
    await user.click(screen.getByRole('menuitem', { name: /logout/ }));
    await waitFor(() =>
      expect(state.logout).toHaveBeenCalledWith({ locale: 'sq', signOut: state.signOut })
    );
  });
});
