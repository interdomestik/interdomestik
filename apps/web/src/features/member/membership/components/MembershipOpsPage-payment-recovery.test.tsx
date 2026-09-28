import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MembershipOpsPage,
  actionMocks,
  selectionMocks,
  setupMembershipOpsPageHarness,
} from './__tests__/membership-ops-page-harness';

describe('MembershipOpsPage', () => {
  setupMembershipOpsPageHarness();

  describe('payment method recovery action', () => {
    function renderPastDueSubscription() {
      selectionMocks.selectedId = 'sub-1';
      actionMocks.getMembershipActions.mockReturnValue({
        primary: {
          id: 'update_payment',
          label: 'Update payment',
        },
        secondary: [],
      });

      render(
        <MembershipOpsPage
          subscriptions={[
            {
              id: 'sub-1',
              status: 'past_due',
              provider: 'paddle',
              planId: 'plan-family',
              createdAt: '2026-03-01T00:00:00.000Z',
              currentPeriodEnd: '2027-03-01T00:00:00.000Z',
              plan: { name: 'Family' },
            } as never,
          ]}
          documents={[]}
        />
      );

      return screen.getByRole('button', { name: 'dunning.update_payment_button' });
    }

    it('always renders the localized recovery label instead of an English-only fallback', () => {
      renderPastDueSubscription();

      expect(
        screen.getByRole('button', { name: 'dunning.update_payment_button' })
      ).toBeInTheDocument();
      expect(screen.queryByText('Update Payment Method')).not.toBeInTheDocument();
    });

    it('shows an accessible preparing status and disables the button while the request is in flight', async () => {
      let resolveRequest: (value: { url?: string; error?: string }) => void = () => {};
      actionMocks.getPaymentUpdateUrl.mockReturnValue(
        new Promise(resolve => {
          resolveRequest = resolve;
        })
      );

      const button = renderPastDueSubscription();
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('actions.payment_update_preparing');
      });
      expect(button).toBeDisabled();

      resolveRequest({ error: 'boom' });
      await waitFor(() => expect(button).not.toBeDisabled());
    });

    it('ignores a second click while a request is already in flight (single in-flight request)', async () => {
      let resolveRequest: (value: { url?: string; error?: string }) => void = () => {};
      actionMocks.getPaymentUpdateUrl.mockReturnValue(
        new Promise(resolve => {
          resolveRequest = resolve;
        })
      );

      const button = renderPastDueSubscription();
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      await waitFor(() => expect(button).toBeDisabled());
      expect(actionMocks.getPaymentUpdateUrl).toHaveBeenCalledTimes(1);

      resolveRequest({ error: 'boom' });
      await waitFor(() => expect(button).not.toBeDisabled());
    });

    it('shows a truthful, accessible, localized error, clears the stale status on retry, and allows retry after a failed attempt', async () => {
      actionMocks.getPaymentUpdateUrl.mockResolvedValueOnce({ error: 'provider_unavailable' });

      const button = renderPastDueSubscription();
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('errors.payment_update_failed');
      });
      expect(button).not.toBeDisabled();
      expect(screen.queryByText(/success/i)).not.toBeInTheDocument();

      let resolveRetry: (value: { url?: string; error?: string }) => void = () => {};
      actionMocks.getPaymentUpdateUrl.mockReturnValue(
        new Promise(resolve => {
          resolveRetry = resolve;
        })
      );
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('actions.payment_update_preparing');
      });
      expect(screen.queryByText('errors.payment_update_failed')).not.toBeInTheDocument();
      expect(actionMocks.getPaymentUpdateUrl).toHaveBeenCalledTimes(2);

      resolveRetry({ error: 'provider_unavailable' });
      await waitFor(() => expect(button).not.toBeDisabled());
    });

    it('keeps the action pending with a truthful "opening" status and never claims success on a valid redirect', async () => {
      actionMocks.getPaymentUpdateUrl.mockResolvedValueOnce({
        url: 'https://pay.example.test/change',
      });

      const button = renderPastDueSubscription();
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('actions.payment_update_opening');
      });
      expect(button).toBeDisabled();
      expect(screen.queryByText(/success/i)).not.toBeInTheDocument();
    });

    it('never claims success or entitlement locally when the action reports an error', async () => {
      actionMocks.getPaymentUpdateUrl.mockResolvedValueOnce({ error: 'provider_unavailable' });

      const button = renderPastDueSubscription();
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('errors.payment_update_failed');
      });

      expect(screen.queryByText('sponsored.activation.success')).not.toBeInTheDocument();
    });
  });
});
