import type { ReactNode } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
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

function installPricingPageHooks() {
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
}

export { hoisted, installPricingPageHooks };
