import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { expectSuccessFeeCalculator } from '@/test/success-fee-calculator-test-utils';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers([['host', 'ks.localhost:3000']])),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'user-1',
      email: 'member@example.com',
    },
  })),
  getPublicBillingCheckoutConfigMock: vi.fn(() => ({
    entity: 'ks',
    tenantId: 'tenant_ks',
    environment: 'sandbox',
    clientToken: 'test_client_token_ks',
    priceIds: {
      standardYear: 'pri_standard_year',
      familyYear: 'pri_family_year',
      businessYear: 'pri_business_year',
    },
  })),
  resolveBillingEntityFromPathSegmentMock: vi.fn(() => 'ks'),
  resolveBillingTenantIdForEntityMock: vi.fn(() => 'tenant_ks'),
  pricingPageRuntimeMock: vi.fn((_: unknown) => null),
}));

const ORIGINAL_ENV = { ...process.env };

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  getPublicBillingCheckoutConfig: hoisted.getPublicBillingCheckoutConfigMock,
  resolveBillingEntityFromPathSegment: hoisted.resolveBillingEntityFromPathSegmentMock,
  resolveBillingTenantIdForEntity: hoisted.resolveBillingTenantIdForEntityMock,
}));

vi.mock('./pricing-page-runtime', () => ({
  PricingPageRuntime: (props: unknown) => hoisted.pricingPageRuntimeMock(props),
}));

vi.mock('@/components/pricing/pricing-table', () => ({
  PricingTable: ({ children }: { children?: ReactNode }) => children ?? null,
}));

import PricingPage from './_core.entry';

describe('PricingPage server shell', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('does not read request headers or session data while rendering the pricing shell', async () => {
    const tree = await PricingPage({
      params: Promise.resolve({ locale: 'sq' }),
    });

    expect(tree).toBeTruthy();
    render(tree);

    expectCoverageMatrix({
      columnKey: 'coverageMatrix.columns.included',
      rowKey: 'coverageMatrix.rows.vehicle.title',
      sectionTestId: 'pricing-coverage-matrix',
    });
    expect(screen.getByTestId('pricing-commercial-disclaimers')).toBeInTheDocument();
    expectSuccessFeeCalculator({ sectionTestId: 'pricing-success-fee-calculator' });
    expectCommercialTerms({ sectionTestId: 'pricing-billing-terms' });
    expect(screen.getByText('pricing.disclaimers.freeStart.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.disclaimers.hotline.title')).toBeInTheDocument();
    expectCommercialTerms({ sectionTestId: 'pricing-billing-terms' });
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
    });
    expect(hoisted.headersMock).not.toHaveBeenCalled();
    expect(hoisted.getSessionMock).not.toHaveBeenCalled();
  });

  it('keeps rendering the pricing shell during local sandbox builds when checkout config is unavailable', async () => {
    process.env.NODE_ENV = 'production';
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

    expect(hoisted.pricingPageRuntimeMock).toHaveBeenCalledWith({
      billingTestMode: false,
      billingTenantId: 'tenant_ks',
      checkoutConfig: null,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'Public Paddle checkout config unavailable for pricing page:',
      checkoutConfigError
    );

    warnSpy.mockRestore();
  });
});
