import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from 'lucide-react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleShell } from './role-shell';
import type { ShellNavigationItem } from './shell-navigation';

const state = vi.hoisted(() => ({ mobile: true }));
vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

const items: ShellNavigationItem[] = [
  { href: '/workspace', title: 'Home', icon: Home, exact: true },
  { href: '/workspace/cases', title: 'Cases', icon: Home },
  { href: '/workspace/settings', title: 'Settings', icon: Home },
  { href: '/workspace/cases/new', title: 'New case', icon: Home },
];
const labels = { navigation: 'Workspace navigation', more: 'More', close: 'Cancel' };
const shell = (pathname = '/workspace', mobileNavigation: 'bottom' | 'drawer' = 'bottom') => (
  <RoleShell
    items={items}
    primaryItems={items.slice(0, 2)}
    pathname={pathname}
    labels={labels}
    mobileNavigation={mobileNavigation}
    brand={<span>Brand</span>}
    context={<span>Workspace</span>}
    tools={<button>Search</button>}
    account={<button>Account</button>}
    sidebarAccount={<button>Existing account control</button>}
  >
    <h1>Existing portal content</h1>
  </RoleShell>
);

beforeEach(() => {
  state.mobile = true;
});

describe('RoleShell', () => {
  it.each(['bottom', 'drawer'] as const)(
    'returns focus to the %s drawer trigger after a Safari-style click from body focus',
    async mode => {
      const user = userEvent.setup();
      const { container } = render(shell('/workspace', mode));
      const selector =
        mode === 'bottom'
          ? 'button[data-sidebar="trigger"]'
          : 'button[data-sidebar="trigger"][aria-haspopup]';
      const trigger = container.querySelector(selector) as HTMLButtonElement;
      expect(document.activeElement).toBe(document.body);
      fireEvent.click(trigger);
      const dialog = await screen.findByRole('dialog', { name: labels.navigation });
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
      );
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
    }
  );

  it.each(['Control', 'Meta'])(
    'returns focus to the current control after reopening More with %s+B',
    async modifier => {
      const user = userEvent.setup();
      render(shell());
      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const search = screen.getByRole('button', { name: 'Search' });
      search.focus();
      expect(search).toHaveFocus();
      await user.keyboard(`{${modifier}>}b{/${modifier}}`);
      const dialog = await screen.findByRole('dialog', { name: 'More' });
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
      );
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(search).toHaveFocus());
    }
  );

  it('returns focus to the header trigger after its full mobile drawer closes', async () => {
    const user = userEvent.setup();
    const { container } = render(shell());
    const trigger = container.querySelector('button[data-sidebar="trigger"]') as HTMLButtonElement;
    await user.click(trigger);
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getAllByRole('link')).toHaveLength(items.length);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(
      within(screen.getByRole('dialog')).queryByRole('link', { name: 'Cases' })
    ).not.toBeInTheDocument();
  });

  it('renders caller navigation and content without inferring a role or routes', () => {
    render(shell('/workspace/cases/case-1'));
    const nav = screen.getByRole('navigation', { name: labels.navigation });
    expect(
      within(nav)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/workspace', '/workspace/cases']);
    expect(within(nav).getByRole('link', { name: 'Cases' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading'));
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('opens More by keyboard, traps focus, and returns focus after Escape and dismissal', async () => {
    const user = userEvent.setup();
    render(shell('/workspace/settings'));
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('data-active', 'true');
    more.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'More' });
    const close = within(dialog).getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Existing account control' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    expect(within(dialog).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(dialog).queryByRole('link', { name: 'Cases' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(more).toHaveFocus();
    await user.click(more);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(more).toHaveFocus());
  });

  it.each(['Escape', 'close button'])(
    'returns focus to More after %s when a Safari-style click opens it from body focus',
    async dismissal => {
      const user = userEvent.setup();
      render(shell());
      const more = screen.getByRole('button', { name: 'More' });
      expect(document.body).toHaveFocus();
      // Unlike user.click, fireEvent.click does not focus the button before activation.
      fireEvent.click(more);
      const dialog = await screen.findByRole('dialog', { name: 'More' });
      const close = within(dialog).getByRole('button', { name: 'Cancel' });
      await waitFor(() => expect(close).toHaveFocus());
      if (dismissal === 'Escape') {
        await user.keyboard('{Escape}');
      } else {
        await user.click(close);
      }
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(more).toHaveFocus());
    }
  );

  it('selects the longest matching destination and closes More only for ordinary navigation', async () => {
    const user = userEvent.setup();
    render(shell('/workspace/cases/new'));
    await user.click(screen.getByRole('button', { name: 'More' }));
    const dialog = screen.getByRole('dialog');
    const link = within(dialog).getByRole('link', { name: 'New case' });
    expect(link).toHaveAttribute('aria-current', 'page');
    fireEvent.click(link, { ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can present all caller destinations in a mobile drawer', async () => {
    const user = userEvent.setup();
    render(shell('/workspace', 'drawer'));
    expect(screen.queryByTestId('role-shell-bottom-nav')).not.toBeInTheDocument();
    const trigger = screen
      .getAllByRole('button', { name: labels.navigation })
      .find(button => button.hasAttribute('aria-haspopup'));
    expect(trigger).toBeDefined();
    await user.click(trigger!);
    const dialog = screen.getByRole('dialog', { name: labels.navigation });
    expect(within(dialog).getAllByRole('link')).toHaveLength(items.length);
    expect(
      within(dialog).getByRole('button', { name: 'Existing account control' })
    ).toBeInTheDocument();
  });

  it('retains desktop sidebar navigation, account and content across narrow transitions', async () => {
    state.mobile = false;
    const user = userEvent.setup();
    const { container, rerender } = render(shell());
    const sidebar = screen.getByTestId('role-shell-sidebar');
    const owner = sidebar.closest('div[data-collapsible="icon"]');
    const trigger = container.querySelector('button[data-sidebar="trigger"]') as HTMLButtonElement;
    expect(owner).toHaveAttribute('data-state', 'collapsed');
    await user.click(trigger);
    expect(owner).toHaveAttribute('data-state', 'expanded');
    await user.click(trigger);
    expect(owner).toHaveAttribute('data-state', 'collapsed');
    expect(within(sidebar).getAllByRole('link')).toHaveLength(items.length);
    expect(
      within(sidebar).getByRole('button', { name: 'Existing account control' })
    ).toBeInTheDocument();
    state.mobile = true;
    rerender(shell());
    expect(screen.queryByTestId('role-shell-sidebar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Existing portal content' })).toBeInTheDocument();
  });
});
