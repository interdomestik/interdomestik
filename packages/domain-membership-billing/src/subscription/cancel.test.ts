import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscriptionCore } from './cancel';
import type { SubscriptionSession } from './types';

// Mock DB
const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      subscriptions: { findFirst: vi.fn() },
    },
  },
  subscriptions: { id: 'id', tenantId: 'tenantId' },
  ensureTenantId: vi.fn(),
  paddle: {
    subscriptions: { cancel: vi.fn() },
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

describe('cancelSubscriptionCore', () => {
  const logAuditEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs audit event on successful cancellation', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    // Mocks
    hoisted.ensureTenantId.mockReturnValue('tenant_abc');
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_123',
      userId: 'user_123',
      tenantId: 'tenant_abc',
    });
    hoisted.paddle.subscriptions.cancel.mockResolvedValue({});

    const result = await cancelSubscriptionCore(
      { session, subscriptionId: 'sub_123' },
      { logAuditEvent }
    );

    expect(result.success).toBe(true);
    expect(hoisted.paddle.subscriptions.cancel).toHaveBeenCalledWith('sub_123', expect.anything());

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.canceled_scheduled',
        entityId: 'sub_123',
        tenantId: 'tenant_abc',
        actorId: 'user_123',
        actorRole: 'member',
      })
    );
  });

  it('denies access if user mismatch', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    hoisted.ensureTenantId.mockReturnValue('tenant_abc');
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_123',
      userId: 'other_user', // Mismatch
      tenantId: 'tenant_abc',
    });

    const result = await cancelSubscriptionCore(
      { session, subscriptionId: 'sub_123' },
      { logAuditEvent }
    );

    expect(result.error).toContain('access denied');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
