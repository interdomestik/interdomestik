import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@interdomestik/database';
import {
  getMatterAllowanceSubscriptionContextForUser,
  getMatterAllowanceVisibilityForUser,
} from './matter-allowance';

const h = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  resolveEffectiveMembership: h.resolve,
}));
const NOW = new Date('2027-06-01');
const START = new Date('2027-01-01');
const END = new Date('2028-01-01');
const sponsor = {
  source: 'sponsor',
  planId: 'family',
  planKey: 'family-key',
  windowStart: START,
  windowEnd: END,
  coverageEnd: new Date('2029-01-01'),
  lifecycle: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
};
function setup() {
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn() };
  const execute = vi.fn();
  const select = vi.fn(() => query);
  return { query, select, execute, tx: { select, execute } as unknown as TenantTransaction };
}
beforeEach(() => vi.clearAllMocks());

describe('matter allowance effective membership', () => {
  it('uses the sponsor plan and covering window while charging usage to the existing row id', async () => {
    const { tx, query, select, execute } = setup();
    h.resolve.mockResolvedValue(new Map([['member-1', sponsor]]));
    query.limit
      .mockResolvedValueOnce([{ id: 'old-paddle-row' }])
      .mockResolvedValueOnce([{ count: 2 }]);
    await expect(
      getMatterAllowanceVisibilityForUser(
        { tx, tenantId: 'tenant-1', userId: 'member-1' },
        { now: NOW }
      )
    ).resolves.toEqual({
      allowanceTotal: 5,
      consumedCount: 2,
      remainingCount: 3,
      windowStart: START,
      windowEnd: END,
    });
    expect(h.resolve).toHaveBeenCalledWith(tx, 'tenant-1', ['member-1'], NOW);
    expect(select).toHaveBeenCalledTimes(2);
    const usageWhere = query.where.mock.calls[1]?.[0];
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const sql = new PgDialect().sqlToQuery(usageWhere);
    expect(sql.params).toEqual(
      expect.arrayContaining(['tenant-1', 'old-paddle-row', START.toISOString(), END.toISOString()])
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps the source-2 row plan and period even for an inactive provider lifecycle', async () => {
    const { tx, select } = setup();
    const subscription = {
      id: 'sub-2',
      status: 'canceled',
      planId: 'standard',
      currentPeriodStart: START,
      currentPeriodEnd: END,
    };
    h.resolve.mockResolvedValue(new Map([['member-1', { source: 'subscription', subscription }]]));
    await expect(
      getMatterAllowanceSubscriptionContextForUser({ tx, tenantId: 'tenant-1', userId: 'member-1' })
    ).resolves.toEqual({
      subscriptionId: 'sub-2',
      planId: 'standard',
      currentPeriodStart: START,
      currentPeriodEnd: END,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it.each(['none', 'absent'])(
    'gives no allowance for source 3 (%s), regardless of a cached group_sponsor row',
    async source => {
      const { tx, select } = setup();
      h.resolve.mockResolvedValue(
        source === 'none' ? new Map([['member-1', { source: 'none' }]]) : new Map()
      );
      await expect(
        getMatterAllowanceVisibilityForUser(
          { tx, tenantId: 'tenant-1', userId: 'member-1' },
          { now: NOW }
        )
      ).resolves.toBeNull();
      expect(select).not.toHaveBeenCalled();
    }
  );

  it('fails closed when sponsor coverage has no row to key usage to', async () => {
    const { tx, query } = setup();
    h.resolve.mockResolvedValue(new Map([['member-1', sponsor]]));
    query.limit.mockResolvedValue([]);
    await expect(
      getMatterAllowanceSubscriptionContextForUser({ tx, tenantId: 'tenant-1', userId: 'member-1' })
    ).resolves.toBeNull();
    expect(query.limit).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to the cached row if coverage resolution fails', async () => {
    const { tx, select } = setup();
    h.resolve.mockRejectedValue(new Error('coverage unavailable'));
    await expect(
      getMatterAllowanceSubscriptionContextForUser({ tx, tenantId: 'tenant-1', userId: 'member-1' })
    ).rejects.toThrow('coverage unavailable');
    expect(select).not.toHaveBeenCalled();
  });
});
