import {
  checkoutConfig,
  localeState,
  mockPaddle,
  mockRouterPush,
  mockToastError,
  resetPricingTest,
} from './pricing-table-test-support';

import * as paddleLib from '@interdomestik/domain-membership-billing/paddle';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingTable } from './pricing-table';

describe('PricingTable', () => {
  beforeEach(resetPricingTest);

  it('passes the active locale into Paddle checkout settings', async () => {
    localeState.value = 'de';

    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
      />
    );

    fireEvent.click(screen.getAllByText('cta')[0]);
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            locale: 'de',
            successUrl: expect.stringContaining('/de/member/membership/success'),
          }),
        })
      );
    });
  });

  it('handles paddle initialization failure gracefully', async () => {
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
      />
    );

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
    });

    expect(screen.getByTestId('pricing-precheckout-confirmation')).toBeInTheDocument();
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    vi.mocked(paddleLib.getPaddleInstance).mockResolvedValue(
      mockPaddle as unknown as import('@paddle/paddle-js').Paddle
    );
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));
    await waitFor(() => expect(mockPaddle.Checkout.open).toHaveBeenCalledOnce());
    expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ priceId: checkoutConfig.priceIds.standardYear, quantity: 1 }],
      })
    );
    consoleError.mockRestore();
  });

  it('blocks checkout when pilot mode freeze is enabled', async () => {
    process.env.NEXT_PUBLIC_PILOT_MODE = 'true';

    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
      />
    );

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    });
  });

  it('keeps billing test success URL contract with test flag first', async () => {
    vi.useFakeTimers();

    try {
      render(
        <PricingTable
          userId="user-123"
          email="test@example.com"
          billingTestMode
          checkoutConfig={checkoutConfig}
        />
      );

      const joinButtons = screen.getAllByText('cta');
      fireEvent.click(joinButtons[0]);
      expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

      await vi.runAllTimersAsync();

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/member/membership/success?test=true&priceId=${checkoutConfig.priceIds.standardYear}&planId=standard`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps plan CTAs disabled while session state is still resolving', () => {
    render(
      <PricingTable billingTestMode={false} isSessionPending checkoutConfig={checkoutConfig} />
    );

    const joinButtons = screen.getAllByText('cta');
    expect(joinButtons[0]).toBeDisabled();
  });

  it.each([
    ['missing', ''],
    ['placeholder', 'test_***'],
  ])(
    'shows an explicit local warning for a %s client token without simulated success',
    async (_label, clientToken) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        render(
          <PricingTable
            userId="user-123"
            email="test@example.com"
            billingTestMode={false}
            checkoutConfig={{ ...checkoutConfig, clientToken }}
          />
        );

        fireEvent.click(screen.getAllByText('cta')[0]);
        expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

        await waitFor(() => {
          expect(screen.getByTestId('pricing-local-checkout-unavailable')).toBeInTheDocument();
          expect(screen.getByText('localCheckout.title')).toBeInTheDocument();
          expect(screen.getByText('localCheckout.body')).toBeInTheDocument();
        });

        expect(mockRouterPush).not.toHaveBeenCalled();
        expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
        expect(consoleWarn).toHaveBeenCalledWith(
          'Paddle client token missing in development, checkout is unavailable locally.'
        );
      } finally {
        consoleWarn.mockRestore();
      }
    }
  );

  it('suppresses the local checkout warning in production Paddle mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_ENV', 'production');
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <PricingTable
          userId="user-123"
          email="test@example.com"
          billingTestMode={false}
          checkoutConfig={{ ...checkoutConfig, clientToken: '' }}
        />
      );

      fireEvent.click(screen.getAllByText('cta')[0]);
      fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

      await waitFor(() => {
        expect(paddleLib.getPaddleInstance).toHaveBeenCalledWith({
          clientToken: '',
          environment: checkoutConfig.environment,
        });
      });

      expect(screen.queryByTestId('pricing-local-checkout-unavailable')).not.toBeInTheDocument();
      expect(consoleWarn).not.toHaveBeenCalledWith(
        'Paddle client token missing in development, checkout is unavailable locally.'
      );
      expect(mockToastError).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('shows a toast in development when a token exists but Paddle init fails', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
      />
    );

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
    });

    expect(mockRouterPush).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });
});
