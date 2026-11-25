import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix } from '@/test/coverage-matrix-test-utils';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { expectSuccessFeeCalculator } from '@/test/success-fee-calculator-test-utils';
import { hoisted, installPricingPageHooks } from './_core.entry.test-support';
import PricingPage from './_core.entry';

describe('PricingPage server shell', () => {
  installPricingPageHooks();

  it('C29 passes only the trusted pricing entry and validated plan under the header tenant without a server session', async () => {
    hoisted.keepParkedPath = true;
    const tree = await PricingPage({
      params: Promise.resolve({ locale: 'sq' }),
      searchParams: Promise.resolve({ plan: 'family' }),
    });

    expect(tree).toBeTruthy();
    render(tree);

    expectCoverageMatrix({
      columnKey: 'coverageMatrix.columns.included',
      rowKey: 'coverageMatrix.rows.vehicle.title',
      sectionTestId: 'pricing-coverage-matrix',
    });
    expect(screen.queryByTestId('register-success-fee-calculator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-billing-terms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-coverage-matrix')).not.toBeInTheDocument();
    expect(screen.getByTestId('pricing-commercial-disclaimers')).toBeInTheDocument();
    expectSuccessFeeCalculator({ sectionTestId: 'pricing-success-fee-calculator' });
    expectCommercialTerms({ sectionTestId: 'pricing-billing-terms' });
    expect(screen.getByText('pricing.disclaimers.freeStart.title')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hero.callNow' })).toHaveAttribute(
      'href',
      '/#free-start-intake'
    );
    expect(screen.getByText('pricing.disclaimers.hotline.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.guidance.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.outOfScope.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.boundary.title')).toBeInTheDocument();
    expect(hoisted.pricingPageRuntimeMock).toHaveBeenCalledWith({
      billingTestMode: false,
      billingTenantId: 'tenant_ks',
      checkoutConfig: expect.objectContaining({
        entity: 'ks',
        tenantId: 'tenant_ks',
      }),
      entityDisclosure: hoisted.entityDisclosure,
      neutralEntryPlan: 'family',
      neutralPricingEntryUrl: 'https://ida.example.test/sq/pricing',
    });
    expect(hoisted.headersMock).toHaveBeenCalledOnce();
    expect(hoisted.authorize).toHaveBeenCalledExactlyOnceWith('tenant_ks');
    expect(hoisted.getSessionMock).not.toHaveBeenCalled();
  });

  it('exposes register commercial promise markers when reached from the register entry', async () => {
    const tree = await PricingPage({
      params: Promise.resolve({ locale: 'sq' }),
      searchParams: Promise.resolve({ entry: 'register' }),
    });

    render(tree);

    expectSuccessFeeCalculator({ sectionTestId: 'pricing-success-fee-calculator' });
    expectCommercialTerms({ sectionTestId: 'pricing-billing-terms' });
    expectCoverageMatrix({
      columnKey: 'coverageMatrix.columns.included',
      rowKey: 'coverageMatrix.rows.vehicle.title',
      sectionTestId: 'pricing-coverage-matrix',
    });
    expect(screen.getByTestId('register-success-fee-calculator')).toBeVisible();
    expect(screen.getByTestId('register-billing-terms')).toBeVisible();
    expect(screen.getByTestId('register-coverage-matrix')).toBeVisible();
  });

  it('keeps rendering the pricing shell during local sandbox builds when checkout config is unavailable', async () => {
    hoisted.keepParkedPath = true;
    process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox';
    delete process.env.VERCEL_ENV;

    const checkoutConfigError = new Error('missing public sandbox checkout config');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hoisted.getPublicBillingCheckoutConfigMock.mockImplementationOnce(() => {
      throw checkoutConfigError;
    });

    const tree = await PricingPage({
      params: Promise.resolve({ locale: 'sq' }),
    });

    render(tree);

    expect(hoisted.pricingPageRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutConfig: null, entityDisclosure: null })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Public Paddle checkout config unavailable for pricing page:',
      checkoutConfigError
    );

    warnSpy.mockRestore();
  });

  it('fails closed in production Paddle mode when public checkout config is unavailable', async () => {
    hoisted.keepParkedPath = true;
    vi.stubEnv('NEXT_PUBLIC_PADDLE_ENV', 'production');
    delete process.env.VERCEL_ENV;

    const checkoutConfigError = new Error('missing public production checkout config');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hoisted.getPublicBillingCheckoutConfigMock.mockImplementationOnce(() => {
      throw checkoutConfigError;
    });

    await expect(
      PricingPage({
        params: Promise.resolve({ locale: 'sq' }),
      })
    ).rejects.toThrow(checkoutConfigError);

    expect(hoisted.pricingPageRuntimeMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
