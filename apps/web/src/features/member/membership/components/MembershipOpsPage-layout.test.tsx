import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MembershipOpsPage,
  actionMocks,
  selectionMocks,
  setupMembershipOpsPageHarness,
} from './__tests__/membership-ops-page-harness';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'active',
    provider: 'cash',
    planId: 'plan-standard',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2027-01-01T00:00:00.000Z',
    plan: { name: 'Standard' },
    gracePeriodEndsAt: null,
    ...overrides,
  } as never;
}

describe('MembershipOpsPage concept A layout', () => {
  setupMembershipOpsPageHarness();

  it('leads with the page heading and the status of the only membership, without a list', () => {
    actionMocks.getMembershipActions.mockReturnValue({ primary: undefined, secondary: [] });
    render(<MembershipOpsPage subscriptions={[subscription()]} documents={[]} />);

    expect(screen.getByRole('heading', { level: 1, name: 'page.title' })).toBeInTheDocument();
    const status = screen.getByRole('region', { name: 'Standard' });
    expect(within(status).getByText('plan.status_label')).toBeInTheDocument();
    expect(within(status).getByTestId('membership-current-period-end')).toBeInTheDocument();
    expect(screen.queryByTestId('membership-subscription-list')).not.toBeInTheDocument();
    // The scope facts follow the status, in their own labelled section.
    const about = screen.getByRole('region', { name: 'ops.about_title' });
    expect(status.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(about).getByTestId('membership-commercial-disclaimers')).toBeInTheDocument();
  });

  it('renders the coverage slot inside the scope section', () => {
    render(
      <MembershipOpsPage
        subscriptions={[]}
        documents={[]}
        coverage={<div data-testid="coverage-slot" />}
      />
    );

    const about = screen.getByRole('region', { name: 'ops.about_title' });
    expect(within(about).getByTestId('coverage-slot')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ops.no_membership_title' })).toHaveAttribute(
      'data-testid',
      'membership-empty'
    );
  });

  it('opens the first of several records and selects another by keyboard-operable button', () => {
    actionMocks.getMembershipActions.mockReturnValue({ primary: undefined, secondary: [] });
    const records = [
      subscription({ id: 'sub-1', plan: { name: 'Standard' } }),
      subscription({ id: 'sub-2', plan: { name: 'Family' } }),
    ];
    render(<MembershipOpsPage subscriptions={records} documents={[]} />);

    const items = screen.getAllByTestId('subscription-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('aria-pressed', 'true');
    expect(items[1]).toHaveAttribute('aria-pressed', 'false');
    expect(items[1].tagName).toBe('BUTTON');
    expect(screen.getByRole('region', { name: 'Standard' })).toBeInTheDocument();

    fireEvent.click(items[1]);
    expect(selectionMocks.setSelectedId).toHaveBeenCalledWith('sub-2');
  });

  it('shows the selected record from the URL selection', () => {
    actionMocks.getMembershipActions.mockReturnValue({ primary: undefined, secondary: [] });
    selectionMocks.selectedId = 'sub-2';
    const records = [
      subscription({ id: 'sub-1', plan: { name: 'Standard' } }),
      subscription({ id: 'sub-2', plan: { name: 'Family' } }),
    ];
    render(<MembershipOpsPage subscriptions={records} documents={[]} />);

    expect(screen.getByRole('region', { name: 'Family' })).toBeInTheDocument();
    expect(screen.getAllByTestId('subscription-item')[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('states that a scheduled cancellation does not renew, and says nothing when none is set', () => {
    actionMocks.getMembershipActions.mockReturnValue({ primary: undefined, secondary: [] });
    const view = render(
      <MembershipOpsPage
        subscriptions={[subscription({ cancelAtPeriodEnd: true })]}
        documents={[]}
      />
    );
    expect(screen.getByTestId('membership-renewal')).toHaveTextContent('ops.renewal_label');
    expect(screen.getByTestId('membership-renewal')).toHaveTextContent('ops.renewal_stops');

    view.rerender(
      <MembershipOpsPage
        subscriptions={[subscription({ id: 'sub-3', cancelAtPeriodEnd: false })]}
        documents={[]}
      />
    );
    expect(screen.queryByTestId('membership-renewal')).not.toBeInTheDocument();
  });

  it('never opens another record for a stale selection, and offers the current one deliberately', () => {
    actionMocks.getMembershipActions.mockReturnValue({
      primary: undefined,
      secondary: [{ id: 'cancel', label: 'Cancel membership' }],
    });
    selectionMocks.selectedId = 'old';
    render(
      <MembershipOpsPage
        subscriptions={[subscription({ id: 'new', plan: { name: 'New plan' } })]}
        documents={[]}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('ops.selection_unavailable');
    expect(screen.queryByRole('region', { name: 'New plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel membership' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('membership-empty')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ops.open_current' }));
    expect(selectionMocks.setSelectedId).toHaveBeenCalledWith(null);
  });

  it('puts the actions in one wrapping row so long labels stack on a narrow screen', () => {
    actionMocks.getMembershipActions.mockReturnValue({
      primary: { id: 'update_payment', label: 'Update payment' },
      secondary: [{ id: 'cancel', label: 'Cancel membership' }],
    });
    render(
      <MembershipOpsPage subscriptions={[subscription({ provider: 'paddle' })]} documents={[]} />
    );

    const row = screen.getByTestId('membership-actions');
    expect(row).toHaveClass('flex-wrap');
    const buttons = within(row).getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual([
      'Cancel membership',
      'dunning.update_payment_button',
    ]);
    for (const button of buttons) expect(button).toHaveClass('whitespace-normal');
  });

  it('gives a stale selection precedence over the empty state and its leave action', () => {
    selectionMocks.selectedId = 'old';
    const view = render(
      <MembershipOpsPage subscriptions={[]} documents={[]} leaveEntryId="entry-future" />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('ops.selection_unavailable');
    expect(screen.queryByTestId('membership-empty')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sponsorCoverage.leave' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ops.open_current' }));
    expect(selectionMocks.setSelectedId).toHaveBeenCalledWith(null);

    // Once the selection is cleared, the member's own empty state and leave action return.
    selectionMocks.selectedId = null;
    view.rerender(
      <MembershipOpsPage subscriptions={[]} documents={[]} leaveEntryId="entry-future" />
    );
    expect(screen.getByTestId('membership-empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sponsorCoverage.leave' })).toHaveAttribute(
      'data-entry-id',
      'entry-future'
    );
  });
});
