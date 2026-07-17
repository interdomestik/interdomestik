import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const hoisted = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  pricingTableMock: vi.fn((_: unknown) => null),
  pricingPageViewedMock: vi.fn(),
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: hoisted.useSessionMock,
  },
}));
vi.mock('@/components/pricing/pricing-table', () => ({
  PricingTable: (props: unknown) => hoisted.pricingTableMock(props),
}));
vi.mock('@/lib/analytics', () => ({
  CommercialFunnelEvents: {
    pricingPageViewed: (...args: [unknown, unknown?]) => hoisted.pricingPageViewedMock(...args),
  },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
}));
import { PricingPageRuntime } from './pricing-page-runtime';
const checkoutConfig = {
  entity: 'ks',
  tenantId: 'tenant_ks',
  environment: 'sandbox',
  entityDisclosure: {
    contractingCompany: 'Interdomestik KS LLC',
    governingLaw: 'XK',
    unavailable: false,
  },
  clientToken: 'test_client_token_ks',
  priceIds: {
    standardYear: 'pri_standard_year',
    familyYear: 'pri_family_year',
    businessYear: 'pri_business_year',
  },
} as const;
const renderRuntime = (props: Partial<Parameters<typeof PricingPageRuntime>[0]> = {}) =>
  render(<PricingPageRuntime billingTestMode={false} checkoutConfig={checkoutConfig} {...props} />);
describe('PricingPageRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });
  it('passes pending session state through to the pricing table while auth resolves', async () => {
    hoisted.useSessionMock.mockReturnValue({
      data: null,
      isPending: true,
    });
    renderRuntime({
      billingTenantId: 'tenant_ks',
      entityDisclosure: checkoutConfig.entityDisclosure,
    });
    await waitFor(() => {
      expect(hoisted.pricingTableMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: undefined,
          entityDisclosure: checkoutConfig.entityDisclosure,
          isSessionPending: true,
          tenantId: 'tenant_ks',
          userId: undefined,
        })
      );
    });
    expect(hoisted.pricingPageViewedMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null, locale: 'sq' }),
      { flow_entry: 'anonymous_public' }
    );
  });
  it('passes resolved member session details through to the pricing table', async () => {
    hoisted.useSessionMock.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'member@example.com',
        },
      },
      isPending: false,
    });
    renderRuntime({
      billingTenantId: 'tenant_mk',
      billingTestMode: true,
      entityDisclosure: checkoutConfig.entityDisclosure,
    });
    await waitFor(() => {
      expect(hoisted.pricingTableMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'member@example.com',
          entityDisclosure: checkoutConfig.entityDisclosure,
          isSessionPending: false,
          tenantId: 'tenant_mk',
          userId: 'user-1',
        })
      );
    });
    expect(hoisted.pricingPageViewedMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null, locale: 'sq' }),
      { flow_entry: 'logged_in_member' }
    );
  });
  it('C31 removes the accepted IDA plan before analytics and exposes no automatic side effect', async () => {
    const hrefsAtAnalytics: string[] = [];
    hoisted.pricingPageViewedMock.mockImplementation(() => {
      hrefsAtAnalytics.push(window.location.href);
    });
    hoisted.useSessionMock.mockReturnValue({ data: null, isPending: false });
    window.history.replaceState({}, '', '/sq/pricing?plan=family#email=private@example.com');
    const first = renderRuntime({
      neutralEntryPlan: 'family',
      neutralPricingEntryUrl: 'http://localhost:3000/sq/pricing',
    });
    await waitFor(() => {
      expect(window.location.href).toBe('http://localhost:3000/sq/pricing');
      expect(hoisted.pricingTableMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ neutralEntryPlan: 'family' })
      );
    });
    expect(hrefsAtAnalytics).toEqual(['http://localhost:3000/sq/pricing']);
    first.unmount();
    window.history.replaceState({}, '', '/sq/pricing?plan=family&tenantId=tenant_mk#private');
    renderRuntime({ neutralPricingEntryUrl: 'http://localhost:3000/sq/pricing' });
    await waitFor(() => expect(window.location.href).toBe('http://localhost:3000/sq/pricing'));
    expect(hrefsAtAnalytics).toEqual([
      'http://localhost:3000/sq/pricing',
      'http://localhost:3000/sq/pricing',
    ]);

    window.history.replaceState({}, '', '/sq/pricing?plan=standard');
    renderRuntime({
      neutralEntryPlan: 'standard',
      neutralPricingEntryUrl: 'https://ida.interdomestik.test/sq/pricing',
    });
    await waitFor(() =>
      expect(hoisted.pricingTableMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ neutralEntryPlan: 'standard' })
      )
    );
    expect(window.location.href).toBe('http://localhost:3000/sq/pricing?plan=standard');
    expect(hoisted.useSessionMock).toHaveBeenCalled();
  });
});
