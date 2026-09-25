import {
  checkoutConfig,
  mockPaddle,
  mockRouterPush,
  resetPricingTest,
} from './pricing-table-test-support';
import { authClient } from '@/lib/auth-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PricingTable } from './pricing-table';

describe('PricingTable', () => {
  beforeEach(resetPricingTest);

  it('sends an email OTP for anonymous self-serve onboarding', async () => {
    render(<PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} />);

    fireEvent.click(screen.getByTestId('plan-cta-standard'));
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    fireEvent.change(screen.getByTestId('pricing-otp-email-input'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.click(screen.getByTestId('pricing-otp-send-cta'));

    await waitFor(() => {
      expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(
        { email: 'member@example.com', type: 'sign-in' },
        { headers: { 'x-interdomestik-locale': 'en' } }
      );
    });

    expect(await screen.findByText('otpStep.sent')).toBeInTheDocument();
  });

  it('verifies the OTP with the deferred onboarding selector and continues into checkout for the selected plan', async () => {
    render(
      <PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} tenantId="tenant_ks" />
    );

    fireEvent.click(screen.getByTestId('plan-cta-standard'));
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    fireEvent.change(screen.getByTestId('pricing-otp-email-input'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.click(screen.getByTestId('pricing-otp-send-cta'));
    await screen.findByTestId('pricing-otp-code-input');
    fireEvent.change(screen.getByTestId('pricing-otp-code-input'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByTestId('pricing-otp-verify-cta'));

    await waitFor(() => {
      expect(authClient.signIn.emailOtp).toHaveBeenCalledWith({
        email: 'member@example.com',
        otp: '123456',
        onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
      });
    });

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            { priceId: checkoutConfig.priceIds.standardYear, quantity: 1 },
          ]),
          customer: { email: 'member@example.com' },
          customData: expect.objectContaining({
            acquisitionSource: 'self_serve_web',
            tenantId: 'tenant_ks',
            userId: 'otp-user-1',
          }),
        })
      );
    });

    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('shows the missing email error when OTP send is attempted without an email', async () => {
    render(<PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} />);

    fireEvent.click(screen.getByTestId('plan-cta-standard'));
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));
    fireEvent.click(screen.getByTestId('pricing-otp-send-cta'));

    expect(screen.getByText('otpStep.errors.missingEmail')).toBeInTheDocument();
    expect(authClient.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it('routes anonymous business users to the assisted business entry path', () => {
    render(<PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} />);

    const businessCta = screen.getByTestId('plan-cta-business');

    expect(businessCta.tagName).toBe('A');
    expect(businessCta).toHaveAttribute('href', '/business-membership');
  });

  it('keeps the business plan on the assisted path for logged-in users', () => {
    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={{
          ...checkoutConfig,
          priceIds: { ...checkoutConfig.priceIds, businessYear: null },
        }}
      />
    );

    const businessCta = screen.getByTestId('plan-cta-business');

    expect(businessCta.tagName).toBe('A');
    expect(businessCta).toHaveAttribute('href', '/business-membership');
  });

  it('keeps mobile-safe touch targets and safe-area spacing on pricing conversion actions', () => {
    render(<PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} />);

    expect(screen.getByTestId('pricing-table-root').className).toContain(
      'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
    );
    expect(screen.getByTestId('plan-cta-standard').className).toContain('min-h-[44px]');
    expect(screen.getByTestId('plan-cta-standard').className).toContain('touch-manipulation');

    fireEvent.click(screen.getByTestId('plan-cta-standard'));

    expect(screen.getByTestId('precheckout-continue-cta').className).toContain('min-h-[44px]');
    expect(screen.getByTestId('precheckout-cancel-cta').className).toContain('min-h-[44px]');
  });

  it('moves focus to the pre-checkout confirmation when it opens', async () => {
    render(<PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} />);

    fireEvent.click(screen.getByTestId('plan-cta-standard'));

    const confirmation = await screen.findByTestId('pricing-precheckout-confirmation');

    await waitFor(() => {
      expect(confirmation).toHaveFocus();
    });
  });

  it('moves focus to the OTP step when it opens from pre-checkout', async () => {
    render(<PricingTable billingTestMode={false} checkoutConfig={checkoutConfig} />);

    fireEvent.click(screen.getByTestId('plan-cta-standard'));
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    const otpStep = await screen.findByTestId('pricing-otp-step');
    const heading = within(otpStep).getByRole('heading', { name: 'otpStep.title' });

    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });
});
