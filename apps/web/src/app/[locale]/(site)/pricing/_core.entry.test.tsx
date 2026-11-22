import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { expectSuccessFeeCalculator } from '@/test/success-fee-calculator-test-utils';
const hoisted = vi.hoisted(() => {
  const entityDisclosure = { contractingCompany: 'KS LLC', governingLaw: 'XK', unavailable: false };

  return {
    entityDisclosure,
    headersMock: vi.fn(async () => new Headers([['host', 'ks.127.0.0.1.nip.io:3000']])),
    authorize: vi.fn(),
    newSales: vi.fn(),
    getSessionMock: vi.fn(async () => ({ user: { id: 'user-1', email: 'member@example.com' } })),
    getPublicBillingCheckoutConfigMock: vi.fn(() => ({
      entity: 'ks',
      tenantId: 'tenant_ks',
      environment: 'sandbox',
      entityDisclosure,
      clientToken: 'test_client_token_ks',
      priceIds: { standardYear: 'standard', familyYear: 'family', businessYear: 'business' },
    })),
    resolveBillingEntityFromPathSegmentMock: vi.fn((entity?: string) => entity ?? null),
    resolveBillingTenantIdForEntityMock: vi.fn((entity: string) => `tenant_${entity}`),
    pricingPageRuntimeMock: vi.fn((_: unknown) => null),
    keepParkedPath: false,
  };
});

const ORIGINAL_ENV = { ...process.env };

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));
vi.mock('@/components/pricing/pricing-table/use-sponsor-checkout-notice', () => ({
  useSponsorCheckoutNotice: () => ({ notice: null }),
}));

vi.mock('@/lib/tenant/public-intake-admission', () => ({
  authorizeOpenPublicIntake: hoisted.authorize,
  isPublicCheckoutOpen: hoisted.newSales,
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

vi.mock('@interdomestik/domain-membership-billing/paddle-closed', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/domain-membership-billing/paddle-closed')>();
  return {
    ...actual,
    get PADDLE_CLOSED() {
      return hoisted.keepParkedPath ? false : actual.PADDLE_CLOSED;
    },
  };
});

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  getPublicBillingCheckoutConfig: hoisted.getPublicBillingCheckoutConfigMock,
  resolveBillingEntityForTenantId: (tenantId?: string) => tenantId?.split('_')[1] ?? null,
  resolveBillingEntityFromPathSegment: hoisted.resolveBillingEntityFromPathSegmentMock,
  resolveBillingTenantIdForEntity: hoisted.resolveBillingTenantIdForEntityMock,
}));

vi.mock('./pricing-page-runtime', () => ({
  PricingPageRuntime: (props: unknown) => hoisted.pricingPageRuntimeMock(props),
}));

vi.mock('@/components/pricing/pricing-table', () => ({
  PricingTable: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import PricingPage from './_core.entry';

describe('PricingPage server shell', () => {
  beforeEach(() => {
    hoisted.keepParkedPath = false;
    process.env = { ...ORIGINAL_ENV };
    process.env.IDA_HOST = 'https://ida.example.test';
    process.env.DATABASE_URL = 'postgresql://fixture@localhost:5432/test';
    process.env.DATABASE_URL_RLS = 'postgresql://fixture@localhost:5432/test';
    process.env.PADDLE_DEFAULT_BILLING_ENTITY = 'ks';
    delete process.env.NEXT_PUBLIC_PADDLE_BILLING_ENTITY;
    delete process.env.BILLING_TEST_MODE;
    delete process.env.NEXT_PUBLIC_BILLING_TEST_MODE;
    vi.clearAllMocks();
    hoisted.authorize.mockResolvedValue({});
    hoisted.newSales.mockResolvedValue(true);
    hoisted.headersMock.mockResolvedValue(new Headers({ host: 'ks.127.0.0.1.nip.io:3000' }));
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

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
