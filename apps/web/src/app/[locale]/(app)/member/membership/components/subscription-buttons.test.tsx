import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cancelSubscription, getPaymentUpdateUrl } from '@/actions/subscription.core';
import { ManageSubscriptionButton } from './manage-subscription-button';
import { UpdatePaymentButton } from './update-payment-button';

vi.mock('@/actions/subscription.core', () => ({
  cancelSubscription: vi.fn(),
  getPaymentUpdateUrl: vi.fn(),
}));

describe('member Paddle controls', () => {
  it('replaces both controls with the closed notice without invoking actions', () => {
    render(
      <>
        <UpdatePaymentButton subscriptionId="sub-fixture" label="Update payment" />
        <ManageSubscriptionButton
          subscriptionId="sub-fixture"
          labels={{
            manage: 'Manage subscription',
            updatePayment: 'Update payment',
            cancel: 'Cancel subscription',
            cancelConfirm: 'Cancel this subscription?',
          }}
        />
      </>
    );

    expect(screen.getAllByText('CLOSED')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Update payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).not.toBeInTheDocument();
    expect(getPaymentUpdateUrl).not.toHaveBeenCalled();
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});
