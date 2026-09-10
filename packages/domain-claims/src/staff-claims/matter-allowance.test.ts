import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@interdomestik/database';

function createSelectChain() {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
}

const NOW = new Date('2026-03-14T12:00:00.000Z');

const mocks = vi.hoisted(() => {
  const columns = new Proxy({} as Record<string, string>, { get: (_target, key) => String(key) });
  const subscriptionQuery = createSelectChain();
  const usageQuery = createSelectChain();

  return {
    db: { select: vi.fn() },
    subscriptions: columns,
    serviceUsage: columns,
    subscriptionQuery,
    usageQuery,
    and: vi.fn((...conditions) => conditions),
    eq: vi.fn((left, right) => [left, right]),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
    withTenant: vi.fn((_tenantId, _column, condition) => condition),
  };
});

vi.mock('@interdomestik/database', () => mocks);

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

import {
  getMatterAllowanceVisibilityForUser,
  getMatterAllowanceSubscriptionContextForUser,
  getMatterAllowanceContextForSubscription,
  hasRecoveryMatterUsageForClaim,
} from './matter-allowance';

describe('allowance visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReset();
  });

  it.each([
    {
      planId: 'standard',
      count: 0,
      allowanceTotal: 2,
      start: '2026-01-01T00:00:00.000Z',
      end: null,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: NOW.toISOString(),
    },
    {
      planId: 'family',
      count: 7,
      allowanceTotal: 5,
      start: null,
      end: '2026-12-31T23:59:59.000Z',
      windowStart: '2025-12-31T00:00:00.000Z',
      windowEnd: '2026-12-31T23:59:59.000Z',
    },
  ])('preserves $planId allowance and fallback window', async test => {
    mocks.db.select
      .mockReturnValueOnce(mocks.subscriptionQuery)
      .mockReturnValueOnce(mocks.usageQuery);
    mocks.subscriptionQuery.limit.mockResolvedValue([
      {
        id: 'sub-1',
        planId: test.planId,
        currentPeriodStart: test.start,
        currentPeriodEnd: test.end,
      },
    ]);
    mocks.usageQuery.limit.mockResolvedValue([{ count: test.count }]);
    const result = await getMatterAllowanceVisibilityForUser({
      tenantId: 'tenant-1',
      userId: 'member-1',
      now: NOW,
    });
    expect(result).toEqual({
      allowanceTotal: test.allowanceTotal,
      consumedCount: test.count,
      remainingCount: Math.max(0, test.allowanceTotal - test.count),
      windowStart: new Date(test.windowStart),
      windowEnd: new Date(test.windowEnd),
    });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      mocks.subscriptions.tenantId,
      expect.any(Object)
    );
  });

  it('returns null without a subscription', async () => {
    mocks.db.select.mockReturnValueOnce(mocks.subscriptionQuery);
    mocks.subscriptionQuery.limit.mockResolvedValue([]);

    const result = await getMatterAllowanceVisibilityForUser({
      tenantId: 'tenant-1',
      userId: 'member-3',
      now: NOW,
    });

    expect(result).toBeNull();
  });
});

describe('transaction propagation', () => {
  it('uses tx for subscription, usage and locked count', async () => {
    const rows = [
      [{ id: 'sub-1', planId: 'standard', currentPeriodStart: NOW, currentPeriodEnd: NOW }],
      [{ id: 'usage-1' }],
      [{ count: 1 }],
    ];
    const query = createSelectChain();
    query.limit.mockImplementation(async () => rows.shift());
    const select = vi.fn(() => query);
    const execute = vi.fn();
    const tx = { select, execute } as unknown as TenantTransaction;
    const scope = { tx, tenantId: 'tenant-1' };
    mocks.db.select.mockReset().mockImplementation(() => {
      throw new Error('Global read forbidden');
    });
    const subscription = await getMatterAllowanceSubscriptionContextForUser({
      ...scope,
      userId: 'member-1',
    });
    expect(subscription?.subscriptionId).toBe('sub-1');
    expect(
      await hasRecoveryMatterUsageForClaim({
        ...scope,
        claimId: 'claim-1',
        subscriptionId: 'sub-1',
      })
    ).toBe(true);
    const context = await getMatterAllowanceContextForSubscription({
      ...scope,
      subscription: subscription!,
      now: NOW,
    });
    expect(context.consumedCount).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [JSON.stringify(['recovery', 'tenant-1', 'sub-1'])],
        strings: expect.arrayContaining([expect.stringContaining('pg_advisory_xact_lock')]),
      })
    );
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[2]);
    expect(select).toHaveBeenCalledTimes(3);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
});

it('serializes two decisions through commit', async () => {
  let used = 1;
  let tail = Promise.resolve();
  const events: string[] = [];
  async function decide(id: number) {
    let release!: () => void;
    const execute = vi.fn(async () => {
      const previous = tail;
      tail = new Promise<void>(resolve => {
        release = resolve;
      });
      await previous;
      events.push(`lock${id}`);
    });
    const query = createSelectChain();
    query.limit.mockImplementation(async () => {
      events.push(`count${id}`);
      return [{ count: used }];
    });
    const tx = { execute, select: () => query } as unknown as TenantTransaction;
    const context = await getMatterAllowanceContextForSubscription({
      tx,
      tenantId: 'tenant-1',
      subscription: {
        subscriptionId: 'sub-1',
        planId: 'standard',
        currentPeriodStart: NOW,
        currentPeriodEnd: NOW,
      },
    });
    const accepted = context.remainingCount > 0;
    if (accepted) used++;
    release(); // Model commit releasing the PostgreSQL transaction lock.
    return accepted;
  }
  expect(await Promise.all([decide(1), decide(2)])).toEqual([true, false]);
  expect(events).toEqual(['lock1', 'count1', 'lock2', 'count2']);
  expect(used).toBe(2);
});
