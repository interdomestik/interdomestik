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

describe('PricingPageRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes pending session state through to the pricing table while auth resolves', async () => {
    hoisted.useSessionMock.mockReturnValue({
      data: null,
      isPending: true,
    });

    render(<PricingPageRuntime billingTestMode={false} />);

    await waitFor(() => {
      expect(hoisted.pricingTableMock).toHaveBeenCalledWith({
        billingTestMode: false,
        email: undefined,
        isSessionPending: true,
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

    render(<PricingPageRuntime billingTestMode />);

    await waitFor(() => {
      expect(hoisted.pricingTableMock).toHaveBeenCalledWith({
        billingTestMode: true,
        email: 'member@example.com',
        isSessionPending: false,
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
