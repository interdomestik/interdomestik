import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPaymentUpdateUrlCore } from './get-payment-update-url';
import type { SubscriptionSession } from './types';

const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      subscriptions: { findFirst: vi.fn() },
    },
  },
  subscriptions: { id: 'id', tenantId: 'tenantId' },
  ensureTenantId: vi.fn(),
  paddle: {
    subscriptions: {
      getPaymentMethodChangeTransaction: vi.fn(),
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
  subscriptions: hoisted.subscriptions,
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('../paddle-server', () => ({
  getPaddle: () => hoisted.paddle,
}));

describe('getPaymentUpdateUrlCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.ensureTenantId.mockReturnValue('tenant_abc');
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      checkout: { url: 'https://pay.example.test/change' },
    });
  });

  it('uses the stored provider subscription id when present', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'mock_sub_internal',
      providerSubscriptionId: 'sub_paddle_123',
      userId: 'user_123',
      tenantId: 'tenant_abc',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: 'mock_sub_internal',
    });

    expect(result).toEqual({
      error: undefined,
      url: 'https://pay.example.test/change',
    });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).toHaveBeenCalledWith(
      'sub_paddle_123'
    );
  });
});
