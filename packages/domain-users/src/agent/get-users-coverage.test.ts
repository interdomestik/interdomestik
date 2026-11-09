import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { getAgentUsersCore } from './get-users';
import type { UserSession } from '../types';

const h = vi.hoisted(() => ({
  resolve: vi.fn(),
  context: vi.fn(),
  tx: { query: { user: { findMany: vi.fn() } } },
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: h.context,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  resolveEffectiveMembership: h.resolve,
}));
const authority = mintTestTenantAuthority('tenant-1', { userId: 'admin-1', role: 'admin' });
const session = { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } } as UserSession;
const START = new Date('2027-01-01');
const END = new Date('2028-01-01');
const row = {
  id: 'sub-1',
  provider: 'paddle',
  status: 'canceled',
  planId: 'standard',
  currentPeriodEnd: new Date('2026-01-01'),
};
const sponsor = {
  source: 'sponsor',
  planId: 'family',
  planKey: 'family-key',
  windowStart: START,
  windowEnd: END,
  coverageEnd: new Date('2029-01-01'),
  lifecycle: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.context.mockImplementation(async (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback(h.tx)
  );
  h.tx.query.user.findMany.mockResolvedValue([{ id: 'member-1', subscriptions: [row] }]);
});

describe('agent effective membership projection', () => {
  it('shows source 1, its status and covering period over the canceled Paddle row', async () => {
    h.resolve.mockResolvedValue(new Map([['member-1', sponsor]]));
    const users = await getAgentUsersCore({ authority, session });
    expect(users[0]).toMatchObject({
      membershipSource: 'sponsor',
      subscription: {
        id: 'sub-1',
        status: 'active',
        planId: 'family',
        planKey: 'family-key',
        currentPeriodStart: START,
        currentPeriodEnd: END,
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: null,
      },
    });
    expect(users[0]?.subscriptions).toEqual([users[0]?.subscription]);
    expect(row.status).toBe('canceled');
    expect(h.resolve).toHaveBeenCalledWith(h.tx, 'tenant-1', ['member-1'], expect.any(Date));
    expect(h.context).toHaveBeenCalledWith(authority, expect.any(Function));
  });

  it.each(['active', 'trialing', 'past_due', 'canceled'])(
    'preserves the source-2 %s row for staff visibility',
    async status => {
      const subscription = { ...row, status };
      h.resolve.mockResolvedValue(
        new Map([['member-1', { source: 'subscription', subscription }]])
      );
      const users = await getAgentUsersCore({ authority, session });
      expect(users[0]?.membershipSource).toBe('subscription');
      expect(users[0]?.subscription).toBe(subscription);
    }
  );

  it('shows none for source 3 despite an active group_sponsor cache row', async () => {
    h.tx.query.user.findMany.mockResolvedValue([
      { id: 'member-1', subscriptions: [{ ...row, provider: 'group_sponsor', status: 'active' }] },
    ]);
    h.resolve.mockResolvedValue(new Map([['member-1', { source: 'none' }]]));
    const users = await getAgentUsersCore({ authority, session });
    expect(users[0]).toMatchObject({
      membershipSource: 'none',
      subscription: null,
      subscriptions: [],
    });
  });

  it('does not fabricate a subscription row when source 1 has no row', async () => {
    h.tx.query.user.findMany.mockResolvedValue([{ id: 'member-1', subscriptions: [] }]);
    h.resolve.mockResolvedValue(new Map([['member-1', sponsor]]));
    const users = await getAgentUsersCore({ authority, session });
    expect(users[0]).toMatchObject({
      membershipSource: 'sponsor',
      subscription: null,
      subscriptions: [],
    });
  });

  it.each([
    { tenantId: 'other-tenant', userId: 'admin-1', role: 'admin' },
    { tenantId: 'tenant-1', userId: 'other-user', role: 'admin' },
    { tenantId: 'tenant-1', userId: 'admin-1', role: 'agent' },
  ])('rejects an authority/session mismatch before querying: %j', async grant => {
    const wrong = mintTestTenantAuthority(grant.tenantId, grant);
    await expect(getAgentUsersCore({ authority: wrong, session })).rejects.toThrow('Unauthorized');
    expect(h.context).not.toHaveBeenCalled();
  });

  it('does not fall back to cached membership on resolver failure', async () => {
    h.resolve.mockRejectedValue(new Error('coverage unavailable'));
    await expect(getAgentUsersCore({ authority, session })).rejects.toThrow('coverage unavailable');
  });
});
