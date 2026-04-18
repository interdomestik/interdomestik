import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActionContext: vi.fn(),
  revalidatePath: vi.fn(),
  findSubscriptionFirst: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

vi.mock('./subscription/context', () => ({
  getActionContext: mocks.getActionContext,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  db: {
    query: {
      subscriptions: {
        findFirst: mocks.findSubscriptionFirst,
      },
    },
    update: mocks.update,
  },
  eq: mocks.eq,
  subscriptions: {
    id: 'subscriptions.id',
    userId: 'subscriptions.user_id',
    tenantId: 'subscriptions.tenant_id',
  },
}));

import { activateSponsoredMembership } from './subscription.core';

describe('subscription.core activateSponsoredMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({
      set: mocks.set.mockReturnValue({
        where: mocks.where.mockResolvedValue(undefined),
      }),
    });
  });

  it('returns Unauthorized when session is missing', async () => {
    mocks.getActionContext.mockResolvedValue({ session: null });

    await expect(activateSponsoredMembership('sub-1')).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('activates only paused sponsored subscriptions', async () => {
    mocks.getActionContext.mockResolvedValue({
      session: {
        user: {
          id: 'member-1',
          tenantId: 'tenant-1',
        },
      },
    });
    mocks.findSubscriptionFirst.mockResolvedValue({
      id: 'sub-1',
      userId: 'member-1',
      tenantId: 'tenant-1',
      status: 'paused',
      planId: 'standard',
      planKey: 'tenant-standard-plan',
      provider: 'group_sponsor',
      acquisitionSource: 'group_roster_import',
    });

    await expect(activateSponsoredMembership('sub-1')).resolves.toEqual({
      success: true,
    });

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        planId: 'standard',
        planKey: 'tenant-standard-plan',
        currentPeriodStart: expect.any(Date),
        currentPeriodEnd: expect.any(Date),
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });
});
