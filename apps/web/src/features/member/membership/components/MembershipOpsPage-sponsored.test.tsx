import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MembershipOpsPage,
  actionMocks,
  selectionMocks,
  setupMembershipOpsPageHarness,
} from './__tests__/membership-ops-page-harness';

describe('MembershipOpsPage', () => {
  setupMembershipOpsPageHarness();

  it.each([null, '2035-03-01T00:00:00.000Z'])(
    'shows payment updates for an active Paddle member with period end %s',
    currentPeriodEnd => {
      selectionMocks.selectedId = 'sub-1';
      actionMocks.getMembershipActions.mockReturnValue({
        primary: undefined,
        secondary: [],
      });

      render(
        <MembershipOpsPage
          subscriptions={[
            {
              id: 'sub-1',
              status: 'active',
              provider: 'paddle',
              planId: 'plan-family',
              createdAt: '2026-03-01T00:00:00.000Z',
              currentPeriodEnd,
              plan: { name: 'Family' },
            } as never,
          ]}
          documents={[]}
        />
      );

      expect(
        screen.getByRole('button', { name: 'dunning.update_payment_button' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Complete membership' })).not.toBeInTheDocument();
    }
  );

  it('does not carry an in-flight payment request to another selected subscription', async () => {
    const subscriptions = ['sub-1', 'sub-2'].map(id => ({
      id,
      status: 'active',
      provider: 'paddle',
      planId: 'plan-family',
      createdAt: '2026-03-01T00:00:00.000Z',
      currentPeriodEnd: null,
      plan: { name: 'Family' },
    })) as never;
    let resolveRequest: (value: { url?: string; error?: string }) => void = () => {};
    actionMocks.getMembershipActions.mockReturnValue({ primary: undefined, secondary: [] });
    actionMocks.getPaymentUpdateUrl.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );
    selectionMocks.selectedId = 'sub-1';
    const view = render(<MembershipOpsPage subscriptions={subscriptions} documents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'dunning.update_payment_button' }));
    expect(screen.getByRole('button', { name: 'dunning.update_payment_button' })).toBeDisabled();

    selectionMocks.selectedId = 'sub-2';
    view.rerender(<MembershipOpsPage subscriptions={subscriptions} documents={[]} />);
    expect(screen.getByRole('button', { name: 'dunning.update_payment_button' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await act(async () => resolveRequest({ url: 'https://pay.example.test/old-subscription' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dunning.update_payment_button' })).toBeEnabled();
  });

  it('activates paused sponsored memberships from the member ops view', async () => {
    selectionMocks.selectedId = 'sub-1';
    actionMocks.activateSponsoredMembership.mockResolvedValue({ success: true });

    render(
      <MembershipOpsPage
        subscriptions={[
          {
            id: 'sub-1',
            status: 'paused',
            planId: 'standard',
            provider: 'group_sponsor',
            acquisitionSource: 'group_roster_import',
            createdAt: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: null,
            plan: { name: 'Standard' },
          } as never,
        ]}
        documents={[]}
      />
    );

    fireEvent.click(screen.getByText('sponsored.activation.cta'));

    await waitFor(() => {
      expect(actionMocks.activateSponsoredMembership).toHaveBeenCalledWith('sub-1');
    });
  });

  it('shows a family self-upgrade CTA for active sponsored standard memberships', () => {
    selectionMocks.selectedId = 'sub-1';

    render(
      <MembershipOpsPage
        subscriptions={[
          {
            id: 'sub-1',
            status: 'active',
            planId: 'standard',
            provider: 'group_sponsor',
            acquisitionSource: 'group_roster_import',
            createdAt: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: '2027-03-01T00:00:00.000Z',
            plan: { name: 'Standard' },
          } as never,
        ]}
        documents={[]}
      />
    );

    expect(screen.queryByRole('button', { name: 'dunning.update_payment_button' })).toBeNull();

    const link = screen.getByRole('link', { name: 'sponsored.upgrade.cta' });
    expect(link).toHaveAttribute('href', '/pricing?plan=family');
  });
});
