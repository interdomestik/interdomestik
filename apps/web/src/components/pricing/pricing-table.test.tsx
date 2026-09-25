import {
  checkoutConfig,
  localeState,
  mockGetCookie,
  mockPaddle,
  mockRouterPush,
  resetPricingTest,
} from './pricing-table-test-support';
import { authClient } from '@/lib/auth-client';
import * as paddleLib from '@interdomestik/domain-membership-billing/paddle';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PricingTable,
  shouldOpenSelfServePrecheckout,
  shouldRenderBusinessMembershipLink,
} from './pricing-table';

describe('PricingTable', () => {
  beforeEach(resetPricingTest);

  it('marks only the server-validated presentation plan and ignores the raw query', async () => {
    window.history.replaceState({}, '', '/pricing?plan=business&tenantId=tenant_mk');
    const first = render(<PricingTable userId="user-123" checkoutConfig={checkoutConfig} />);
    expect(screen.getByTestId('plan-card-business')).toHaveAttribute('data-selected-plan', '0');
    first.unmount();
    const p = { checkoutConfig, neutralEntryPlan: 'family' as const };
    const entry = (url: string) => <PricingTable {...p} neutralPricingEntryUrl={url} />;
    const view = render(entry('https://ida.interdomestik.test/pricing'));
    await waitFor(() =>
      expect(screen.getByTestId('plan-card-family')).toHaveAttribute('data-selected-plan', '1')
    );
    expect(screen.queryByTestId('pricing-otp-step')).not.toBeInTheDocument();
    view.rerender(entry('http://localhost:3000/not-pricing'));
    expect(screen.queryByTestId('pricing-otp-step')).not.toBeInTheDocument();
    view.rerender(entry('http://localhost:3000/pricing'));
    expect(await screen.findByTestId('pricing-otp-step')).toBeInTheDocument();
    view.rerender(<PricingTable checkoutConfig={checkoutConfig} />);
    expect(screen.queryByTestId('pricing-otp-step')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-card-family')).toHaveAttribute('data-selected-plan', '0');
  });

  it('requires self-serve review independently of session state', () => {
    expect(shouldOpenSelfServePrecheckout({ userId: undefined, planId: 'standard' })).toBe(true);
    expect(shouldOpenSelfServePrecheckout({ userId: undefined, planId: 'family' })).toBe(true);
    expect(shouldOpenSelfServePrecheckout({ userId: undefined, planId: 'business' })).toBe(false);
    expect(shouldOpenSelfServePrecheckout({ userId: 'user-123', planId: 'standard' })).toBe(true);

    expect(
      shouldRenderBusinessMembershipLink({
        planId: 'business',
        isPilotMode: false,
        isSessionPending: false,
      })
    ).toBe(true);
    expect(
      shouldRenderBusinessMembershipLink({
        planId: 'standard',
        isPilotMode: false,
        isSessionPending: false,
      })
    ).toBe(false);
  });

  it('renders plans correctly', () => {
    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
      />
    );

    expect(screen.queryByText('basic.name')).toBeNull();
    expect(screen.queryByText('monthly')).toBeNull();
    expect(screen.queryByText('yearly')).toBeNull();
    expect(screen.getByText('standard.name')).toBeDefined();
    expect(screen.getByText('family.name')).toBeDefined();
    expect(screen.getByText('business.name')).toBeDefined();
    expect(screen.getAllByText('€20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€95').length).toBeGreaterThan(0);
  });

  it('opens checkout only after the signed-in member reviews the plan', async () => {
    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
        tenantId="tenant_ks"
      />
    );

    // Find the Join Now button for standard plan (now at index 0)
    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]); // Standard plan
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            { priceId: checkoutConfig.priceIds.standardYear, quantity: 1 },
          ]),
          customer: { email: 'test@example.com' },
          customData: expect.objectContaining({
            acquisitionSource: 'self_serve_web',
            locale: 'en',
            tenantId: 'tenant_ks',
            userId: 'user-123',
          }),
          settings: expect.objectContaining({
            successUrl: expect.stringContaining('/en/member/membership/success'),
            locale: 'en',
          }),
        })
      );
    });
  });

  it.each(['en', 'sq', 'mk', 'sr'])(
    'keeps %s member plan review cancellable and presentation-only',
    async locale => {
      localeState.value = locale;
      window.history.replaceState({}, '', '/pricing?tenantId=tenant_mk&plan=family');
      render(
        <PricingTable
          userId="user-123"
          checkoutConfig={checkoutConfig}
          entityDisclosure={{
            contractingCompany: 'Interdomestik KS LLC',
            governingLaw: 'XK',
            unavailable: false,
          }}
        />
      );
      fireEvent.click(screen.getByTestId('plan-cta-standard'));
      const review = screen.getByTestId('pricing-precheckout-confirmation');
      expect(review).toHaveFocus();
      expect(within(review).getByText('standard.name')).toBeInTheDocument();
      expect(within(review).getByText('Interdomestik KS LLC')).toBeInTheDocument();
      expect(within(review).getByText('XK')).toBeInTheDocument();
      expect(paddleLib.getPaddleInstance).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('precheckout-cancel-cta'));
      expect(screen.queryByTestId('pricing-precheckout-confirmation')).not.toBeInTheDocument();
      expect(screen.getByTestId('plan-cta-standard')).toHaveFocus();
      expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(authClient.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('plan-cta-family'));
      expect(
        within(screen.getByTestId('pricing-precheckout-confirmation')).getByText('family.name')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('precheckout-continue-cta'));
      await waitFor(() => expect(mockPaddle.Checkout.open).toHaveBeenCalledOnce());
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: checkoutConfig.priceIds.familyYear, quantity: 1 }],
          customData: expect.objectContaining({
            locale,
            tenantId: 'tenant_ks',
            userId: 'user-123',
          }),
        })
      );
    }
  );

  it('preserves agent and marketing attribution in checkout customData when available', async () => {
    mockGetCookie.mockReturnValue('agent-42');
    globalThis.history.replaceState(
      {},
      '',
      '/pricing?utm_source=google&utm_medium=cpc&utm_campaign=funnel&utm_content=hero'
    );

    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
        tenantId="tenant_mk"
      />
    );

    fireEvent.click(screen.getAllByText('cta')[0]);
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          customData: expect.objectContaining({
            acquisitionSource: 'self_serve_web',
            agentId: 'agent-42',
            locale: 'en',
            tenantId: 'tenant_mk',
            utmSource: 'google',
            utmMedium: 'cpc',
            utmCampaign: 'funnel',
            utmContent: 'hero',
          }),
        })
      );
    });
  });

  it('C30 navigates an anonymous tenant continuation once to trusted IDA without OTP or Paddle', async () => {
    const navigateTopLevel = vi.fn();
    const neutralPricingEntryUrl = 'https://ida.interdomestik.test/en/pricing';
    render(<PricingTable {...{ checkoutConfig, navigateTopLevel, neutralPricingEntryUrl }} />);

    const standardCta = screen.getByTestId('plan-cta-standard');
    expect(standardCta.tagName).toBe('BUTTON');

    fireEvent.click(standardCta);

    const confirmation = screen.getByTestId('pricing-precheckout-confirmation');
    expect(confirmation).toBeInTheDocument();
    for (const text of ['joinSecurely', 'standard.name', '€20', 'preCheckout.responsePromise']) {
      expect(within(confirmation).getByText(text)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    expect(navigateTopLevel).toHaveBeenCalledOnce();
    expect(navigateTopLevel).toHaveBeenCalledWith(`${neutralPricingEntryUrl}?plan=standard`);
    expect(screen.queryByTestId('pricing-otp-step')).not.toBeInTheDocument();
    expect(authClient.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
  });

  it('keeps an existing IDA member session ahead of the presentation-only plan reference', async () => {
    render(
      <PricingTable checkoutConfig={checkoutConfig} neutralEntryPlan="family" userId="member-1" />
    );
    await waitFor(() =>
      expect(screen.getByTestId('plan-card-family')).toHaveAttribute('data-selected-plan', '1')
    );
    expect(screen.queryByTestId('pricing-otp-step')).not.toBeInTheDocument();
    expect(authClient.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
  });
  it('locks review and plan changes while checkout initialization is pending', async () => {
    let resolvePaddle!: (value: import('@paddle/paddle-js').Paddle | null) => void;
    vi.mocked(paddleLib.getPaddleInstance).mockReturnValue(
      new Promise(resolve => {
        resolvePaddle = resolve;
      })
    );
    render(
      <PricingTable userId="user-123" billingTestMode={false} checkoutConfig={checkoutConfig} />
    );
    fireEvent.click(screen.getByTestId('plan-cta-standard'));
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));
    for (const id of [
      'precheckout-continue-cta',
      'precheckout-cancel-cta',
      'plan-cta-standard',
      'plan-cta-family',
      'plan-cta-business',
    ]) {
      expect(screen.getByTestId(id)).toBeDisabled();
      fireEvent.click(screen.getByTestId(id));
    }
    expect(paddleLib.getPaddleInstance).toHaveBeenCalledOnce();
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('pricing-precheckout-confirmation')).toBeInTheDocument();
    await act(async () =>
      resolvePaddle(mockPaddle as unknown as import('@paddle/paddle-js').Paddle)
    );
    expect(mockPaddle.Checkout.open).toHaveBeenCalledOnce();
    expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ priceId: checkoutConfig.priceIds.standardYear, quantity: 1 }],
      })
    );
    expect(screen.getByTestId('precheckout-cancel-cta')).toBeEnabled();
  });
});
