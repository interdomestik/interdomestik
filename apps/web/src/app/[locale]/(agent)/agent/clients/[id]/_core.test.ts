import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    mockDb.limit.mockResolvedValueOnce([]);

    const result = await getAgentClientProfileCore({
      memberId: 'mem_1',
      viewer: { id: 'agent_1', role: 'agent' },
    });

    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns ok with activities for assigned agent', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({ id: 'mem_1', name: 'Member 1' });

    mockDb.query.subscriptions.findFirst.mockResolvedValue(null);
    mockDb.query.userNotificationPreferences.findFirst.mockResolvedValue(null);
    mockDb.query.memberActivities.findMany.mockResolvedValue([{ id: 'activity_1' }]);

    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.groupBy.mockReturnThis();
    mockDb.orderBy.mockReturnThis();

    mockDb.limit.mockResolvedValueOnce([{ id: 'assign_1' }]);

    mockDb.groupBy.mockResolvedValueOnce([]);

    mockDb.limit.mockResolvedValueOnce([]);

    const result = await getAgentClientProfileCore({
      memberId: 'mem_1',
      viewer: { id: 'agent_1', role: 'agent' },
    });

    expect(result).toMatchObject({
      kind: 'ok',
      member: { id: 'mem_1' },
      activities: [{ id: 'activity_1' }],
    });
    expect(mockDb.query.memberActivities.findMany).toHaveBeenCalled();
  });
});
