import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  pricingTableMock: vi.fn((_: unknown) => null),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: hoisted.useSessionMock,
  },
}));

vi.mock('@/components/pricing/pricing-table', () => ({
  PricingTable: (props: unknown) => hoisted.pricingTableMock(props),
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
  });
});
