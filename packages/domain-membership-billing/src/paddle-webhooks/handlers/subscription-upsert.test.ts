import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const tx = { insert: vi.fn(), update: vi.fn().mockReturnValue({ set }) };
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    appendEvent: vi.fn(),
    db: {
      query: { subscriptions: { findFirst: vi.fn() } },
      transaction: vi.fn(async callback => callback(tx)),
    },
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    returning,
    set,
    subscriptions: { id: 'subscriptions.id', tenantId: 'subscriptions.tenant_id' },
    tx,
    where,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  appendEvent: hoisted.appendEvent,
  db: hoisted.db,
  eq: hoisted.eq,
  subscriptions: hoisted.subscriptions,
}));

vi.mock('../../subscription', () => ({ findSubscriptionByProviderReference: vi.fn() }));

import { upsertSubscription } from './subscription-upsert';

describe('upsertSubscription tenant-scoped update guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.returning.mockResolvedValue([]);
  });

  it('does not emit a subscription event when the update matches no tenant row', async () => {
    await expect(
      upsertSubscription({
        existingSub: { id: 'sub_existing', tenantId: 'tenant_abc', userId: 'user_123' },
        mappedStatus: 'active',
        planState: { planId: 'standard', planKey: 'mk-standard-plan' },
        sub: {
          id: 'sub_paddle_456',
          customerId: 'ctm_1',
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
        tenantId: 'tenant_abc',
        userId: 'user_123',
      })
    ).rejects.toThrow('update matched no tenant-scoped row');

    expect(hoisted.set).toHaveBeenCalled();
    expect(hoisted.appendEvent).not.toHaveBeenCalled();
  });
});
