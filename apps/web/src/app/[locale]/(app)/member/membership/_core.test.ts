import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));

  return {
    and,
    eq,
    findSubscriptionFirst: vi.fn(),
    findSubscriptionMany: vi.fn(),
    findDocumentsMany: vi.fn(),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  subscriptions: {
    userId: 'subscriptions.user_id',
    tenantId: 'subscriptions.tenant_id',
  },
  db: {
    query: {
      subscriptions: {
        findFirst: hoisted.findSubscriptionFirst,
        findMany: hoisted.findSubscriptionMany,
      },
      documents: {
        findMany: hoisted.findDocumentsMany,
      },
    },
  },
}));

import {
  computeDunningState,
  getDaysRemaining,
  getMemberSubscriptionsCore,
  getMembershipPageModelCore,
  isGracePeriodExpired,
  type MembershipDunningState,
} from './_core';

function extractScope(where: unknown): { userId: string | null; tenantId: string | null } {
  if (!where || typeof where !== 'object') {
    return { userId: null, tenantId: null };
  }

  const andNode = where as {
    op?: string;
    args?: Array<{ op?: string; left?: unknown; right?: unknown }>;
  };
  if (andNode.op !== 'and' || !Array.isArray(andNode.args)) {
    return { userId: null, tenantId: null };
  }

  let userId: string | null = null;
  let tenantId: string | null = null;

  for (const clause of andNode.args) {
    if (clause?.op !== 'eq') {
      continue;
    }

    if (clause.left === 'subscriptions.user_id' && typeof clause.right === 'string') {
      userId = clause.right;
    }

    if (clause.left === 'subscriptions.tenant_id' && typeof clause.right === 'string') {
      tenantId = clause.right;
    }
  }

  return { userId, tenantId };
}

describe('membership core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findSubscriptionFirst.mockResolvedValue(null);
    hoisted.findSubscriptionMany.mockResolvedValue([]);
    hoisted.findDocumentsMany.mockResolvedValue([]);
  });

  it('getDaysRemaining returns 0 for null end date', () => {
    expect(getDaysRemaining({ endDate: null, now: new Date('2025-01-01T00:00:00Z') })).toBe(0);
  });

  it('isGracePeriodExpired returns false for null end date', () => {
    expect(isGracePeriodExpired({ endDate: null, now: new Date('2025-01-01T00:00:00Z') })).toBe(
      false
    );
  });

  it('computes grace period state for past_due subscription', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const gracePeriodEndsAt = new Date('2025-01-04T00:00:00Z');

    const dunning = computeDunningState({
      now,
      subscription: {
        status: 'past_due',
        gracePeriodEndsAt,
      },
    });

    expect(dunning).toEqual<MembershipDunningState>({
      isPastDue: true,
      isInGracePeriod: true,
      isGraceExpired: false,
      daysRemaining: 3,
    });
  });

  it('marks grace expired when now is after gracePeriodEndsAt', () => {
    const now = new Date('2025-01-05T00:00:00Z');
    const gracePeriodEndsAt = new Date('2025-01-04T00:00:00Z');

    const dunning = computeDunningState({
      now,
      subscription: {
        status: 'past_due',
        gracePeriodEndsAt,
      },
    });

    expect(dunning.isPastDue).toBe(true);
    expect(dunning.isInGracePeriod).toBe(false);
    expect(dunning.isGraceExpired).toBe(true);
    expect(dunning.daysRemaining).toBe(0);
  });

  it('applies tenant and user predicates for subscription list reads', async () => {
    await getMemberSubscriptionsCore({
      userId: 'member-1',
      tenantId: 'tenant-ks',
    });

    expect(hoisted.findSubscriptionMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          op: 'and',
          args: expect.arrayContaining([
            expect.objectContaining({
              op: 'eq',
              left: 'subscriptions.user_id',
              right: 'member-1',
            }),
            expect.objectContaining({
              op: 'eq',
              left: 'subscriptions.tenant_id',
              right: 'tenant-ks',
            }),
          ]),
        }),
      })
    );
  });

  it('returns empty subscriptions when tenant context is missing', async () => {
    await expect(
      getMemberSubscriptionsCore({
        userId: 'member-1',
        tenantId: null,
      })
    ).resolves.toEqual([]);

    expect(hoisted.findSubscriptionMany).not.toHaveBeenCalled();
  });

  it('returns null for cross-tenant subscription read attempts with same user id', async () => {
    const storedSubscription = {
      id: 'sub-mk-1',
      userId: 'member-1',
      tenantId: 'tenant-mk',
      status: 'active',
      gracePeriodEndsAt: null,
    };

    hoisted.findSubscriptionFirst.mockImplementation(async (queryArg: { where?: unknown }) => {
      const scope = extractScope(queryArg.where);
      if (
        scope.userId === storedSubscription.userId &&
        scope.tenantId === storedSubscription.tenantId
      ) {
        return storedSubscription;
      }
      return null;
    });

    const model = await getMembershipPageModelCore({
      userId: 'member-1',
      tenantId: 'tenant-ks',
      now: new Date('2025-01-01T00:00:00Z'),
    });

    expect(model.subscription).toBeNull();
    expect(model.dunning).toEqual<MembershipDunningState>({
      isPastDue: false,
      isInGracePeriod: false,
      isGraceExpired: false,
      daysRemaining: 0,
    });
  });
});
