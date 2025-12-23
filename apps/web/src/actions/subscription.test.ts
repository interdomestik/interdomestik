import { auth } from '@/lib/auth';
import { paddle } from '@/lib/paddle-server';
import { db } from '@interdomestik/database';
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
  eq: vi.fn(),
  subscriptions: { id: 'id', userId: 'userId' },
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/paddle-server', () => ({
  paddle: {
    subscriptions: {
      cancel: vi.fn(),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({}),
}));

describe('cancelSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed if user owns subscription', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sub1',
      userId: 'u1',
    });
    (paddle.subscriptions.cancel as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ success: true });
    expect(paddle.subscriptions.cancel).toHaveBeenCalledWith('sub1', {
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
      user: { id: 'u1' },
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
      user: { id: 'u1' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Subscription not found or access denied' });
  });
});
