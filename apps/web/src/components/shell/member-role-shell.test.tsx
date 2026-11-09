import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberRoleShell } from './member-role-shell';
import { AgentRoleShell } from './agent-role-shell';
import { buildDashboardNavigationModel } from '@/hooks/use-dashboard-navigation';

const state = vi.hoisted(() => ({
  pathname: '/member',
  query: '',
  signOut: vi.fn(),
  logout: vi.fn(),
  useSession: vi.fn(),
  canAccessAdmin: vi.fn(),
}));
vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}));
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
  state.query = '';
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

describe('AgentRoleShell', () => {
  it.each(['/agent/workspace/claims', '/agent/claims'])(
    'retains the query only for the current destination %s',
    async pathname => {
      const user = userEvent.setup();
      state.pathname = pathname;
      state.query = 'claimId=A&tab=open';
      const shell = () => (
        <AgentRoleShell agentTier="pro" user={{ id: 'agent-1', role: 'agent', name: 'Agent' }}>
          Case workspace
        </AgentRoleShell>
      );
      const view = render(shell());
      const bottom = screen.getByTestId('role-shell-bottom-nav');
      const claimsHref =
        pathname === '/agent/claims' ? `${pathname}?${state.query}` : '/agent/claims';
      expect(within(bottom).getByRole('link', { name: 'trackClaims' })).toHaveAttribute(
        'href',
        claimsHref
      );
      await user.click(screen.getByRole('button', { name: 'more' }));
      const dialog = screen.getByRole('dialog');
      const workspaceHref =
        pathname === '/agent/workspace/claims'
          ? `${pathname}?${state.query}`
          : '/agent/workspace/claims';
      expect(within(dialog).getByRole('link', { name: 'claimsPro.title' })).toHaveAttribute(
        'href',
        workspaceHref
      );
      expect(within(dialog).getByRole('link', { name: 'rapidPos' })).toHaveAttribute(
        'href',
        '/agent/pos'
      );
      expect(within(dialog).getByRole('link', { name: 'workspace.title' })).toHaveAttribute(
        'href',
        '/agent/workspace'
      );
      // After leaving claims, returning through More uses the bare destination.
      state.pathname = '/agent/workspace';
      state.query = '';
      view.rerender(shell());
      expect(within(dialog).getByRole('link', { name: 'claimsPro.title' })).toHaveAttribute(
        'href',
        '/agent/workspace/claims'
      );
    }
  );

  it.each(['standard', 'pro', 'office'])(
    'preserves %s navigation admission and account slots',
    async tier => {
      const user = userEvent.setup();
      state.pathname = '/agent/workspace/claims';
      render(
        <AgentRoleShell agentTier={tier} user={{ id: 'agent-1', role: 'agent', name: 'Agent' }}>
          <div data-testid="agent-content">Case workspace</div>
        </AgentRoleShell>
      );
      const bottom = screen.getByTestId('role-shell-bottom-nav');
      expect(
        within(bottom)
          .getAllByRole('link')
          .map(link => link.getAttribute('href'))
      ).toEqual(['/agent', '/agent/members', '/agent/claims']);
      expect(screen.getByTestId('agent-content')).toHaveTextContent('Case workspace');
      expect(await screen.findByTestId('user-nav')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'toggleSidebar' }));
      const navigation = within(screen.getByRole('dialog')).getByRole('navigation');
      const paths = within(navigation)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'));
      const previous = buildDashboardNavigationModel({
        t: key => key,
        role: 'agent',
        agentTier: tier,
        adminAccess: false,
      }).agentItems.map(item => item.href);
      expect(paths).toEqual([...previous, '/agent/workspace', '/agent/workspace/claims']);
      expect(paths.includes('/agent/leads')).toBe(tier !== 'standard');
      expect(paths.includes('/agent/sponsors')).toBe(tier === 'office');
      expect(paths).toContain('/agent/pos');
      expect(paths.every(path => !path?.includes('?'))).toBe(true);
      expect(within(navigation).getByRole('link', { name: 'claimsPro.title' })).toHaveAttribute(
        'aria-current',
        'page'
      );
      expect(screen.getByTestId('sidebar-user-menu-button')).toBeInTheDocument();
      expect(state.useSession).not.toHaveBeenCalled();
      expect(state.canAccessAdmin).not.toHaveBeenCalled();
    }
  );
});
