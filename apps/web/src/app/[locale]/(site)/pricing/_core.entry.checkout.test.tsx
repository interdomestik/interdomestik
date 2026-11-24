import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hoisted, installPricingPageHooks } from './_core.entry.test-support';
import PricingPage from './_core.entry';

describe('PricingPage server shell', () => {
  installPricingPageHooks();

  it.each(['ks', 'mk'])(
    'the parked checkout uses the disposable CI tenant fixture on %s with both keys open',
    async country => {
      hoisted.keepParkedPath = true;
      delete process.env.PADDLE_DEFAULT_BILLING_ENTITY;
      process.env.NEXT_PUBLIC_BILLING_TEST_MODE = '1';
      process.env.BILLING_TEST_MODE = '1';
      process.env.INTERDOMESTIK_LOCAL_E2E = '1';
      process.env.PLAYWRIGHT = '1';
      hoisted.headersMock.mockResolvedValueOnce(
        new Headers({ host: `${country}.127.0.0.1.nip.io:3000` })
      );
      render(await PricingPage({ params: Promise.resolve({ locale: 'sq' }) }));
      expect(hoisted.pricingPageRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          billingTestMode: true,
          billingTenantId: `tenant_${country}`,
          checkoutConfig: null,
        })
      );
      expect(hoisted.getPublicBillingCheckoutConfigMock).not.toHaveBeenCalled();
    }
  );

  it.each(['public_intake', 'new_sales', 'tenant', 'checkout_entity'])(
    'the parked checkout renders display-only plans and skips Paddle config when blocked by %s',
    async blockedBy => {
      hoisted.keepParkedPath = true;
      if (blockedBy === 'public_intake') hoisted.authorize.mockResolvedValueOnce(null);
      if (blockedBy === 'new_sales') hoisted.newSales.mockResolvedValueOnce(false);
      if (blockedBy === 'tenant') process.env.PADDLE_DEFAULT_BILLING_ENTITY = 'mk';
      if (blockedBy === 'checkout_entity') process.env.NEXT_PUBLIC_PADDLE_BILLING_ENTITY = 'mk';

      render(
        await PricingPage({
          params: Promise.resolve({ locale: 'sq' }),
          searchParams: Promise.resolve({ plan: 'family' }),
        })
      );

      expect(screen.getByText('pricing.CLOSED')).toBeVisible();
      expect(screen.getByTestId('plan-card-family')).toBeVisible();
      expect(screen.queryByTestId('plan-cta-family')).not.toBeInTheDocument();
      expect(hoisted.pricingPageRuntimeMock).not.toHaveBeenCalled();
      expect(hoisted.getPublicBillingCheckoutConfigMock).not.toHaveBeenCalled();
    }
  );

  it.each(['without Paddle configuration', 'with Paddle configuration', 'in CI billing test mode'])(
    'renders the closed notice and display-only plans %s',
    async runtime => {
      if (runtime === 'without Paddle configuration') {
        delete process.env.PADDLE_DEFAULT_BILLING_ENTITY;
        delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS;
      } else {
        process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS = 'paddle-client-token-fixture';
      }
      if (runtime === 'in CI billing test mode') {
        process.env.NEXT_PUBLIC_BILLING_TEST_MODE = '1';
        process.env.BILLING_TEST_MODE = '1';
        process.env.INTERDOMESTIK_LOCAL_E2E = '1';
        process.env.PLAYWRIGHT = '1';
      }

      render(
        await PricingPage({
          params: Promise.resolve({ locale: 'sq' }),
          searchParams: Promise.resolve({ plan: 'family' }),
        })
      );

      expect(screen.getByTestId('pricing-checkout-closed')).toHaveTextContent('pricing.CLOSED');
      expect(screen.getByTestId('plan-card-family')).toBeVisible();
      expect(screen.queryByTestId('plan-cta-family')).not.toBeInTheDocument();
      expect(hoisted.pricingPageRuntimeMock).not.toHaveBeenCalled();
      expect(hoisted.getPublicBillingCheckoutConfigMock).not.toHaveBeenCalled();
    }
  );
});
