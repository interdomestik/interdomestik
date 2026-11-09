import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { CoverageRow, SubscriptionRow } from './sponsor-coverage/resolve';
import { getActiveSubscription, hasActiveMembership } from './subscription';

const h = vi.hoisted(() => {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };
  return {
    query,
    tx: { select: vi.fn(() => query), query: { subscriptions: { findFirst: vi.fn() } } },
    context: vi.fn(),
  };
});
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: h.context,
}));

const NOW = new Date('2027-06-01T00:00:00Z');
const START = new Date('2027-01-01T00:00:00Z');
const END = new Date('2028-01-01T00:00:00Z');
const RENEWAL_END = new Date('2029-01-01T00:00:00Z');
const row = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  userId: 'member-1',
  provider: 'paddle',
  providerSubscriptionId: 'paddle-1',
  status: 'canceled',
  planId: 'standard',
  planKey: 'old-plan',
  agentId: 'agent-1',
  branchId: 'branch-1',
  cancelAtPeriodEnd: false,
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2027-01-01'),
  gracePeriodEndsAt: new Date('2027-02-01'),
} as SubscriptionRow;

function coverage(subscription: SubscriptionRow | null, sponsor = false): CoverageRow {
  return {
    userId: 'member-1',
    subscription,
    paidUntil: null,
    approvedDecisionId: sponsor ? 'decision-1' : null,
    entry: sponsor
      ? ({
          id: 'entry-1',
          conflictDecision: 'accepted',
          revokedAt: null,
          outcome: 'seated',
          startsAt: START.toISOString(),
        } as CoverageRow['entry'])
      : null,
    term: sponsor
      ? ({
          id: 'term-1',
          sponsorId: 'sponsor-1',
          termStart: START.toISOString(),
          termEnd: END.toISOString(),
          terminatedEffectiveAt: null,
          planId: 'family',
          planKey: 'family-key',
          legalEntityId: 'entity-1',
        } as CoverageRow['term'])
      : null,
  };
}

let authority: TenantAuthority;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  authority = mintTestTenantAuthority('tenant-1');
  vi.clearAllMocks();
  h.context.mockImplementation(async (_authority: unknown, action: (tx: unknown) => unknown) =>
    action(h.tx)
  );
  h.tx.query.subscriptions.findFirst.mockResolvedValue(row);
  h.query.where.mockResolvedValue([coverage(row)]);
});
afterEach(() => vi.useRealTimers());

describe('membership readers with the real coverage resolver', () => {
  it('overlays source 1 on the one canceled Paddle row without changing its ownership or provider', async () => {
    h.query.where.mockResolvedValue([coverage(row, true)]);
    await expect(hasActiveMembership('member-1', authority)).resolves.toBe(true);
    await expect(getActiveSubscription('member-1', authority)).resolves.toEqual({
      ...row,
      status: 'active',
      cancelAtPeriodEnd: true,
      gracePeriodEndsAt: null,
      planId: 'family',
      planKey: 'family-key',
      currentPeriodStart: START,
      currentPeriodEnd: END,
    });
    expect(row.status).toBe('canceled');
    expect(h.context).toHaveBeenCalledTimes(2);
    expect(h.context).toHaveBeenCalledWith(authority, expect.any(Function));
  });

  it('uses the covering interval rather than coverage_end for the period of a contiguous renewal', async () => {
    const current = coverage(row, true);
    const renewal: CoverageRow = {
      ...current,
      entry: { ...current.entry, id: 'entry-2', startsAt: null } as CoverageRow['entry'],
      term: {
        ...current.term,
        id: 'term-2',
        termStart: END.toISOString(),
        termEnd: RENEWAL_END.toISOString(),
      } as CoverageRow['term'],
    };
    h.query.where.mockResolvedValue([current, renewal]);
    await expect(getActiveSubscription('member-1', authority)).resolves.toMatchObject({
      currentPeriodStart: START,
      currentPeriodEnd: END,
      cancelAtPeriodEnd: false,
    });
  });

  it.each(['active', 'trialing', 'past_due'] as const)(
    'preserves source 2 %s access and the original row',
    async status => {
      const subscription = { ...row, status, gracePeriodEndsAt: END };
      h.query.where.mockResolvedValue([coverage(subscription)]);
      await expect(hasActiveMembership('member-1', authority)).resolves.toBe(true);
      await expect(getActiveSubscription('member-1', authority)).resolves.toBe(subscription);
      expect(h.tx.query.subscriptions.findFirst).not.toHaveBeenCalled();
    }
  );

  it.each(['canceled', 'paused', 'past_due'] as const)(
    'preserves source 2 denial for %s outside grace',
    async status => {
      h.query.where.mockResolvedValue([coverage({ ...row, status })]);
      await expect(hasActiveMembership('member-1', authority)).resolves.toBe(false);
      await expect(getActiveSubscription('member-1', authority)).resolves.toBeNull();
    }
  );

  it('never grants access from an active group_sponsor row alone', async () => {
    h.query.where.mockResolvedValue([
      coverage({ ...row, provider: 'group_sponsor', status: 'active' }),
    ]);
    await expect(hasActiveMembership('member-1', authority)).resolves.toBe(false);
    await expect(getActiveSubscription('member-1', authority)).resolves.toBeNull();
    expect(h.tx.query.subscriptions.findFirst).not.toHaveBeenCalled();
  });

  it.each(['start', 'end'])(
    'observes the half-open source-1 %s boundary without a job',
    async boundary => {
      vi.setSystemTime(boundary === 'start' ? START : END);
      authority = mintTestTenantAuthority('tenant-1');
      h.query.where.mockResolvedValue([coverage({ ...row, provider: 'group_sponsor' }, true)]);
      await expect(hasActiveMembership('member-1', authority)).resolves.toBe(boundary === 'start');
      const result = await getActiveSubscription('member-1', authority);
      expect(result === null).toBe(boundary === 'end');
    }
  );

  it('grants resolved sponsor access but never fabricates a missing subscription row', async () => {
    h.query.where.mockResolvedValue([coverage(null, true)]);
    h.tx.query.subscriptions.findFirst.mockResolvedValue(undefined);
    await expect(hasActiveMembership('member-1', authority)).resolves.toBe(true);
    await expect(getActiveSubscription('member-1', authority)).resolves.toBeNull();
  });

  it('fails closed for a member absent from the tenant-scoped resolver result', async () => {
    h.query.where.mockResolvedValue([]);
    await expect(hasActiveMembership('member-1', authority)).resolves.toBe(false);
    await expect(getActiveSubscription('member-1', authority)).resolves.toBeNull();
  });

  it('propagates a resolver failure rather than using the cached row', async () => {
    h.query.where.mockRejectedValue(new Error('coverage unavailable'));
    await expect(hasActiveMembership('member-1', authority)).rejects.toThrow(
      'coverage unavailable'
    );
    await expect(getActiveSubscription('member-1', authority)).rejects.toThrow(
      'coverage unavailable'
    );
  });
});
