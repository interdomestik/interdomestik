import { describe, expect, it, vi } from 'vitest';
import { getAgentClientProfileCore } from './_core';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    query: {
      user: {
        findFirst: vi.fn(),
      },
      subscriptions: {
        findFirst: vi.fn(),
      },
      userNotificationPreferences: {
        findFirst: vi.fn(),
      },
      memberActivities: {
        findMany: vi.fn(),
      },
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  };
  return { mockDb };
});

vi.mock('@interdomestik/database', () => ({
  db: mockDb,
  // Mock schema objects as simple strings/objects since we only check usage
  agentClients: { agentId: 'agentId', memberId: 'memberId', status: 'status' },
  claims: { status: 'status', userId: 'userId', createdAt: 'createdAt' },
  memberActivities: { memberId: 'memberId', occurredAt: 'occurredAt' },
  subscriptions: { userId: 'userId', createdAt: 'createdAt' },
  userNotificationPreferences: { userId: 'userId' },
  user: { id: 'id' },
  and: vi.fn(),
  eq: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
}));

describe('getAgentClientProfileCore', () => {
  it('returns not_found if member does not exist', async () => {
    mockDb.query.user.findFirst.mockResolvedValue(null);

    const result = await getAgentClientProfileCore({
      memberId: 'missing_mem',
      viewer: { id: 'agent_1', role: 'agent' },
    });

    expect(result).toEqual({ kind: 'not_found' });
    expect(mockDb.query.user.findFirst).toHaveBeenCalled();
  });

  it('checks agent assignment and returns forbidden if not assigned', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({ id: 'mem_1' });

    // Mock assignment query returning empty
    // Chain: select().from().where().limit() -> []
    mockDb.limit.mockResolvedValue([]);

    const result = await getAgentClientProfileCore({
      memberId: 'mem_1',
      viewer: { id: 'agent_1', role: 'agent' },
    });

    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns ok with data if assigned', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({ id: 'mem_1', name: 'Member 1' });

    // Mock assignment found
    mockDb.limit.mockResolvedValueOnce([{ id: 'assign_1' }]); // assignment check

    // Mock parallel queries
    mockDb.query.subscriptions.findFirst.mockResolvedValue(null);
    mockDb.query.userNotificationPreferences.findFirst.mockResolvedValue(null);
    mockDb.query.memberActivities.findMany.mockResolvedValue([]);

    // Mock claims counts (first select chain after assignment)
    // We need to be careful with chaining mocks in parallel.
    // Vitest mocks are stateful.
    // For simplicity in this unit test, let's assume the chained mocks return something appropriate
    // or we mock the implementation of Promise.all components if simpler.
    // But since we mocked `db.select`, it returns `mockDb` (this).
    // The `limit` or `groupBy` needs to return the final data.

    // Reset and refine select mock for multiple calls
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.groupBy.mockReturnThis();
    mockDb.orderBy.mockReturnThis();

    // 1. Assignment check (limit 1)
    mockDb.limit.mockResolvedValueOnce([{ id: 'assign_1' }]);

    // 2. Claims count (groupBy) -> returns []
    mockDb.groupBy.mockResolvedValueOnce([]);

    // 3. Recent claims (limit RECENT_CLAIMS_LIMIT)
    mockDb.limit.mockResolvedValueOnce([]);

    const result = await getAgentClientProfileCore({
      memberId: 'mem_1',
      viewer: { id: 'agent_1', role: 'agent' },
    });

    expect(result).toMatchObject({ kind: 'ok', member: { id: 'mem_1' } });
  });
});
