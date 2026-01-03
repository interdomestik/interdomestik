import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { getPaddle } from '@interdomestik/domain-membership-billing/paddle-server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscription } from './subscription';

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      subscriptions: {
        findFirst: vi.fn(),
      },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  subscriptions: { id: 'id', userId: 'userId', tenantId: 'tenantId' },
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  getPaddle: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({}),
}));

describe('cancelSubscription', () => {
  const mockPaddle = {
    subscriptions: {
      cancel: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getPaddle as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockPaddle);
  });

  it('should succeed if user owns subscription', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sub1',
      userId: 'u1',
    });
    (mockPaddle.subscriptions.cancel as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ success: true });
    expect(mockPaddle.subscriptions.cancel).toHaveBeenCalledWith('sub1', {
      effectiveFrom: 'next_billing_period',
    });
  });

  it('should fail if unauthorized', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Unauthorized' });
  });

  it('should fail if not owner', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sub1',
      userId: 'u2',
    });

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Subscription not found or access denied' });
  });

  it('should fail if subscription not found', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Subscription not found or access denied' });
  });
});
