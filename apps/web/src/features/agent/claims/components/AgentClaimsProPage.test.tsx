import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpsTable } from '@/components/ops/OpsTable';
import { OpsTableCards } from '@/components/ops/OpsTableCards';
import { RoleShell } from '@/components/shell/role-shell';
import { AgentClaimsProPage, type AgentProClaim } from './AgentClaimsProPage';

const state = vi.hoisted(() => ({ query: '', replace: vi.fn(), panel: vi.fn() }));
vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ locale: _locale, ...props }: ComponentProps<'a'> & { locale?: string }) => (
    <a {...props} />
  ),
}));
vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => {
    state.panel(props);
    return <div data-testid="shared-composer" />;
  },
}));

const claim: AgentProClaim = {
  id: 'claim-1',
  title: 'Public case',
  claimNumber: 'C-001',
  status: 'submitted',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  member: { id: 'member-1', name: 'Member', email: 'member@example.test' },
  branch: { name: 'Assigned branch' },
  unreadCount: 1,
  lastMessage: 'Public reply',
};
const currentUser = { id: 'agent-1', name: 'Agent', image: null, role: 'agent' };
const page = (claims = [claim]) => <AgentClaimsProPage claims={claims} currentUser={currentUser} />;

beforeEach(() => {
  vi.clearAllMocks();
  state.query = '';
  state.replace.mockImplementation((href: string) => {
    state.query = href.slice(1);
  });
});

describe('agent workspace URL and mobile presentation', () => {
  it('shows the title without exposing internal identifiers when no claim number exists', () => {
    state.query = 'selected=GOLDEN_K_INTERNAL';
    render(page([{ ...claim, id: 'GOLDEN_K_INTERNAL', claimNumber: '', lastMessage: null }]));
    expect(screen.getByTestId('workspace-selected-claim-id')).toHaveTextContent('Public case');
    expect(screen.queryByText('GOLDEN_K_INTERNAL')).not.toBeInTheDocument();
    const row = screen.getByTestId('claim-row');
    expect(row).toHaveTextContent('Public case');
    expect(row).not.toHaveTextContent('GOLDEN');
    expect(row).not.toHaveTextContent('ID:');
  });

  it.each(['Escape', 'close'])('returns focus to B after A -> B -> %s', async closeBy => {
    const user = userEvent.setup();
    const claims = [claim, { ...claim, id: 'claim-2', claimNumber: 'C-002' }];
    const view = render(page(claims));
    const [cardA, cardB] = screen.getAllByTestId('claim-row');
    fireEvent.click(cardA);
    view.rerender(page(claims));
    await waitFor(() => expect(screen.getByTestId('ops-drawer')).toHaveFocus());
    fireEvent.click(cardB);
    view.rerender(page(claims));
    expect(screen.getByTestId('workspace-selected-claim-id')).toHaveTextContent('C-002');
    await waitFor(() => expect(screen.getByTestId('ops-drawer')).toHaveFocus());
    if (closeBy === 'Escape') {
      await user.keyboard('{Escape}');
    } else {
      await user.click(screen.getByRole('button', { name: 'claimsPro.closeLabel' }));
    }
    view.rerender(page(claims));
    await waitFor(() => expect(cardB).toHaveFocus());
    expect(cardA).not.toHaveFocus();
    expect(screen.queryByTestId('ops-drawer')).not.toBeInTheDocument();
    expect(state.query).toBe('');
  });

  it.each(['Escape', 'close'])(
    'clears case selection on %s and returns focus to its card',
    async closeBy => {
      const user = userEvent.setup();
      const view = render(page());
      const opener = screen.getByTestId('claim-row');
      expect(opener.tagName).toBe('BUTTON');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(opener).toHaveTextContent('Public reply');
      // Safari-style pointer activation: capture focus before URL navigation.
      fireEvent.click(opener);
      view.rerender(page());
      await waitFor(() => expect(screen.getByTestId('ops-drawer')).toHaveFocus());
      expect(state.query).toBe(`selected=${claim.id}`);
      if (closeBy === 'Escape') {
        await user.keyboard('{Escape}');
      } else {
        await user.click(screen.getByRole('button', { name: 'claimsPro.closeLabel' }));
      }
      view.rerender(page());
      await waitFor(() => expect(opener).toHaveFocus());
      expect(screen.queryByTestId('ops-drawer')).not.toBeInTheDocument();
      expect(state.query).toBe('');
    }
  );

  it('preserves claimId through shell More dismissal and refresh, with public-only composition', async () => {
    const user = userEvent.setup();
    state.query = `claimId=${claim.id}`;
    const workspace = () => (
      <RoleShell
        items={[]}
        pathname="/agent/workspace/claims"
        labels={{ navigation: 'Navigation', more: 'More', close: 'Cancel' }}
        brand={null}
        context={null}
        account={null}
        sidebarAccount={null}
      >
        {page()}
      </RoleShell>
    );
    const view = render(workspace());
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    expect(await screen.findByRole('dialog', { name: 'More' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(more).toHaveFocus());
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.query).toBe(`claimId=${claim.id}`);
    expect(screen.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claim.id
    );
    view.unmount();
    render(workspace());
    expect(screen.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claim.id
    );
    expect(state.query).toBe(`claimId=${claim.id}`);
    await user.click(screen.getByTestId('action-message'));
    expect(screen.getByTestId('shared-composer')).toBeInTheDocument();
    expect(state.panel).toHaveBeenLastCalledWith({
      claimId: claim.id,
      currentUser,
      isAgent: true,
      allowInternal: false,
    });
    await user.click(screen.getByTestId('close-messaging-view'));
    expect(screen.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claim.id
    );
    expect(state.query).toBe(`claimId=${claim.id}`);
    await user.click(screen.getByRole('button', { name: 'claimsPro.closeLabel' }));
    expect(state.query).toBe('');
  });

  it('reads a direct claimId and an inaccessible selection without inventing a thread', () => {
    state.query = 'claimId=claim-1';
    const view = render(
      <AgentClaimsProPage claims={[claim]} currentUser={currentUser} selectedClaimId="stale" />
    );
    expect(screen.getByTestId('ops-drawer')).toBeInTheDocument();
    state.query = 'claimId=not-assigned';
    view.rerender(page());
    expect(screen.getByTestId('workspace-claim-not-accessible')).toBeInTheDocument();
    expect(screen.queryByTestId('ops-drawer')).not.toBeInTheDocument();
    expect(state.panel).not.toHaveBeenCalled();
  });

  it('keeps a failed mobile read distinct from an empty list and exposes retry', async () => {
    const retry = vi.fn();
    const table = (error: boolean) => (
      <OpsTable
        columns={[{ key: 'claim', header: 'Claim' }]}
        rows={[]}
        mobileCards
        emptyLabel="No cases"
        error={error}
        onRetry={retry}
      />
    );
    const view = render(table(true));
    expect(screen.queryByText('No cases')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try Again' }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(table(false));
    expect(screen.getByText('No cases')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load data')).not.toBeInTheDocument();
  });
});

describe('OpsTableCards', () => {
  it('renders each labelled field once and keeps row actions separate from selection', async () => {
    const select = vi.fn();
    const action = vi.fn();
    render(
      <OpsTableCards
        columns={[
          { key: 'case', header: 'Case' },
          { key: 'status', header: 'Status' },
        ]}
        rows={[
          {
            id: '1',
            cells: ['Long case title', 'Open'],
            onClick: select,
            actions: <button onClick={action}>Existing action</button>,
          },
        ]}
        rowTestId="card"
      />
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('Case');
    expect(card).toHaveTextContent('Status');
    expect(within(card).getAllByText('Long case title')).toHaveLength(1);
    const user = userEvent.setup();
    card.focus();
    await user.keyboard(' ');
    expect(select).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Existing action' }));
    expect(action).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
  });
});
