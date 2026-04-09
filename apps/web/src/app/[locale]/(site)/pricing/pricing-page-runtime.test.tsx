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
  clientToken: 'test_client_token_ks',
  priceIds: {
    standardYear: 'pri_standard_year',
    familyYear: 'pri_family_year',
    businessYear: 'pri_business_year',
  },
} as const;

describe('PricingPageRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes pending session state through to the pricing table while auth resolves', async () => {
    hoisted.useSessionMock.mockReturnValue({
      data: null,
      isPending: true,
    });

    render(
      <PricingPageRuntime
        billingTenantId="tenant_ks"
        billingTestMode={false}
        checkoutConfig={checkoutConfig}
      />
    );

    await waitFor(() => {
      expect(hoisted.pricingTableMock).toHaveBeenCalledWith({
        billingTestMode: false,
        checkoutConfig,
        email: undefined,
        isSessionPending: true,
        tenantId: 'tenant_ks',
        userId: undefined,
      });
    });

    expect(hoisted.pricingPageViewedMock).toHaveBeenCalledWith(
      {
        tenantId: null,
        variant: 'hero_v1',
        locale: 'sq',
      },
      {
        flow_entry: 'anonymous_public',
      }
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

    render(
      <PricingPageRuntime
        billingTenantId="tenant_mk"
        billingTestMode
        checkoutConfig={checkoutConfig}
      />
    );

    await waitFor(() => {
      expect(hoisted.pricingTableMock).toHaveBeenCalledWith({
        billingTestMode: true,
        checkoutConfig,
        email: 'member@example.com',
        isSessionPending: false,
        tenantId: 'tenant_mk',
        userId: 'user-1',
      });
    });

    expect(hoisted.pricingPageViewedMock).toHaveBeenCalledWith(
      {
        tenantId: null,
        variant: 'hero_v1',
        locale: 'sq',
      },
      {
        flow_entry: 'logged_in_member',
      }
    );
  });
});
