import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  subscriptionsFindFirst: vi.fn(),
  prefsFindFirst: vi.fn(),
  memberActivitiesFindMany: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      user: { findFirst: hoisted.userFindFirst },
      subscriptions: { findFirst: hoisted.subscriptionsFindFirst },
      userNotificationPreferences: { findFirst: hoisted.prefsFindFirst },
      memberActivities: { findMany: hoisted.memberActivitiesFindMany },
    },
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'user.id' },
  subscriptions: { userId: 'subscriptions.userId', createdAt: 'subscriptions.createdAt' },
  userNotificationPreferences: { userId: 'prefs.userId' },
  claims: {
    id: 'claims.id',
    userId: 'claims.userId',
    status: 'claims.status',
    createdAt: 'claims.createdAt',
  },
  memberActivities: {
    memberId: 'memberActivities.memberId',
    occurredAt: 'memberActivities.occurredAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  desc: vi.fn((v: unknown) => ({ desc: v })),
  count: vi.fn(() => ({ kind: 'count' })),
}));

import { getAgentClientProfileCore } from './_core';

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(result),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe('getAgentClientProfileCore', () => {
  it('returns not_found when member does not exist', async () => {
    hoisted.userFindFirst.mockResolvedValue(null);

    const res = await getAgentClientProfileCore({
      memberId: 'm1',
      viewer: { id: 'v1', role: 'agent' },
    });

    expect(res).toEqual({ kind: 'not_found' });
  });

  it('returns forbidden when agent tries to access a member they do not own', async () => {
    hoisted.userFindFirst.mockResolvedValue({ id: 'm1', agentId: 'agent-OTHER' });

    const res = await getAgentClientProfileCore({
      memberId: 'm1',
      viewer: { id: 'agent-1', role: 'agent' },
    });

    expect(res).toEqual({ kind: 'forbidden' });
  });

  it('computes claim counts and normalizes membership status', async () => {
    hoisted.userFindFirst.mockResolvedValue({ id: 'm1', agentId: 'agent-1', agent: null });
    hoisted.subscriptionsFindFirst.mockResolvedValue({ status: 'active', planId: 'standard' });
    hoisted.prefsFindFirst.mockResolvedValue({ emailClaimUpdates: true });
    hoisted.memberActivitiesFindMany.mockResolvedValue([{ id: 'a1' }]);

    hoisted.dbSelect
      .mockReturnValueOnce(
        createSelectChain([
          { status: 'resolved', total: 2 },
          { status: 'rejected', total: 1 },
          { status: 'submitted', total: 3 },
        ])
      )
      .mockReturnValueOnce(createSelectChain([{ id: 'c1', status: 'submitted' }]));

    const res = await getAgentClientProfileCore({
      memberId: 'm1',
      viewer: { id: 'agent-1', role: 'agent' },
    });

    if (res.kind !== 'ok') {
      throw new Error('Expected ok result');
    }

    expect(res.claimCounts).toEqual({ total: 6, open: 3, resolved: 2, rejected: 1 });
    expect(res.membership.status).toBe('active');
    expect(res.membership.badgeClass).toContain('bg-emerald-100');
    expect(res.recentClaims).toEqual([{ id: 'c1', status: 'submitted' }]);
  });

  it('falls back membership status to none for unknown status', async () => {
    hoisted.userFindFirst.mockResolvedValue({ id: 'm1', agentId: 'agent-1', agent: null });
    hoisted.subscriptionsFindFirst.mockResolvedValue({ status: 'weird_status' });
    hoisted.prefsFindFirst.mockResolvedValue(null);
    hoisted.memberActivitiesFindMany.mockResolvedValue([]);

    hoisted.dbSelect
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(createSelectChain([]));

    const res = await getAgentClientProfileCore({
      memberId: 'm1',
      viewer: { id: 'agent-1', role: 'agent' },
    });

    if (res.kind !== 'ok') {
      throw new Error('Expected ok result');
    }

    expect(res.membership.status).toBe('none');
  });
});
