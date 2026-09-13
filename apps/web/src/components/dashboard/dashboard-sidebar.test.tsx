import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider, useSidebar } from '@interdomestik/ui';
import { Home } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellNavigation, type ShellNavigationItem } from '../shell/shell-navigation';

const state = vi.hoisted(() => ({ mobile: false }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./sidebar-user-menu', () => ({ SidebarUserMenu: () => <div>Account</div> }));
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));
vi.mock('@/actions/admin-access', () => ({ canAccessAdmin: vi.fn() }));
import { DashboardSidebar } from './dashboard-sidebar';
vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
  usePathname: () => '/member',
}));

const item = (href: string, title = href): ShellNavigationItem => ({ href, title, icon: Home });
const memberItems = [
  { ...item('/member', 'Overview'), exact: true },
  item('/member/claims', 'Claims'),
  item('/member/claims/new', 'New claim'),
];
function DrawerControl() {
  const { openMobile, setOpenMobile } = useSidebar();
  return <button onClick={() => setOpenMobile(true)}>{openMobile ? 'Open' : 'Closed'}</button>;
}
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DrawerControl />
      {children}
    </SidebarProvider>
  );
}
const nav = (items = memberItems, pathname = '/member') => (
  <ShellNavigation label="Workspace" pathname={pathname} groups={[{ id: 'main', items }]} />
);
const current = () => screen.getAllByRole('link').filter(link => link.hasAttribute('aria-current'));

beforeEach(() => {
  state.mobile = false;
});
describe('shared shell navigation', () => {
  it('renders semantic navigation and one current link', () => {
    render(nav(memberItems, '/member/claims/new'), { wrapper: Wrapper });
    const navigation = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(navigation).getByRole('list')).toBeInTheDocument();
    expect(within(navigation).queryByRole('menu')).not.toBeInTheDocument();
    expect(current()).toEqual([screen.getByRole('link', { name: 'New claim' })]);
    expect(screen.getByRole('link', { name: 'New claim' })).toHaveAttribute('data-active', 'true');
    expect(navigation.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
  });

  it.each([
    ['/member', 'Overview'],
    ['/member/claims/case-1', 'Claims'],
    ['/member/claims/new/step-2', 'New claim'],
    ['/member/claimsmith', null],
    ['/member/claims/newish', 'Claims'],
    ['/member/settings', null],
  ])('selects segment-aware routes for %s', (pathname, title) => {
    render(nav(memberItems, pathname), { wrapper: Wrapper });
    expect(current()).toEqual(title ? [screen.getByRole('link', { name: title })] : []);
  });

  it('deduplicates destinations but preserves query variants', () => {
    render(
      <ShellNavigation
        label="Workspace"
        pathname="/admin/users"
        groups={[
          { id: 'member', items: [item('/member')] },
          {
            id: 'extra',
            items: [item('/member'), item('/admin/users'), item('/admin/users?role=agent')],
          },
        ]}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual([
      '/member',
      '/admin/users',
      '/admin/users?role=agent',
    ]);
    expect(current()).toHaveLength(1);
  });

  it('updates caller selection and tenant context', () => {
    const view = (tenant: string) =>
      nav(
        [
          { ...item(`/admin/users?tenantId=${tenant}`, 'Members'), selected: false },
          { ...item(`/admin/users?tenantId=${tenant}&role=agent`, 'Agents'), selected: true },
        ],
        '/admin/users'
      );
    const { rerender } = render(view('ks'), { wrapper: Wrapper });
    expect(current()).toEqual([screen.getByRole('link', { name: 'Agents' })]);
    rerender(view('mk'));
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute(
      'href',
      '/admin/users?tenantId=mk&role=agent'
    );
    expect(
      screen.getAllByRole('link').every(link => !link.getAttribute('href')?.includes('=ks'))
    ).toBe(true);
  });

  it('replaces items and preserves empty-state content', () => {
    const view = (items: ShellNavigationItem[]) => (
      <>
        {nav(items)}
        <h1>Case content</h1>
      </>
    );
    const { rerender } = render(view([item('/agent/leads')]), { wrapper: Wrapper });
    rerender(view([item('/staff/claims')]));
    expect(screen.queryByRole('link', { name: '/agent/leads' })).not.toBeInTheDocument();
    rerender(view([]));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Case content' })).toBeInTheDocument();
  });

  it('keeps native keyboard semantics', async () => {
    const user = userEvent.setup();
    render(nav(), { wrapper: Wrapper });
    await user.tab();
    await user.tab();
    const overview = screen.getByRole('link', { name: 'Overview' });
    expect(overview).toHaveFocus();
    const clicked = vi.fn((event: Event) => event.preventDefault());
    overview.addEventListener('click', clicked);
    await user.keyboard(' ');
    expect(clicked).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('closes mobile navigation only for normal clicks', () => {
    state.mobile = true;
    render(nav(), { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Closed' }));
    const link = screen.getByRole('link', { name: 'Claims' });
    fireEvent.click(link, { ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    fireEvent.click(link);
    expect(screen.getByRole('button', { name: 'Closed' })).toBeInTheDocument();
  });
});

const shellUser = (role: string) => ({ id: 'user', name: 'User', email: 'user@example.com', role });
describe('DashboardSidebar consumers', () => {
  it.each(['member', 'agent', 'admin'])('integrates the %s model and caller chrome', role => {
    const { rerender } = render(<DashboardSidebar user={shellUser(role)} />, {
      wrapper: Wrapper,
    });
    const links = () =>
      within(screen.getByTestId('shell-navigation'))
        .getAllByRole('link')
        .map(link => link.getAttribute('href'));
    expect(links()).toContain(role === 'agent' ? '/agent' : '/member');
    expect(links()).toContain(role === 'agent' ? '/agent/claims' : '/member/claims');
    expect(links()).not.toContain(role === 'agent' ? '/member' : '/agent');
    expect(links().includes('/admin/overview')).toBe(role === 'admin');
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Interdomestik')).toBeInTheDocument();
    rerender(<DashboardSidebar user={shellUser('agent')} agentTier="office" />);
    expect(links()).toContain('/agent/leads');
    expect(links()).toContain('/agent/import');
    rerender(<DashboardSidebar user={shellUser('agent')} />);
    expect(links()).not.toContain('/agent/import');
    expect(links()).not.toContain('/agent/leads');
  });
  it('retains the established session fallback', () => {
    render(<DashboardSidebar />, { wrapper: Wrapper });
    expect(
      within(screen.getByTestId('shell-navigation')).getByRole('link', { name: 'overview' })
    ).toBeInTheDocument();
  });
});
