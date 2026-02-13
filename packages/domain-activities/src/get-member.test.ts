import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
    query: {
      memberActivities: {
        findMany: (...args: unknown[]) => mocks.findMany(...args),
      },
    },
  },
  // Minimal shape for query builder inputs
  desc: (x: unknown) => x,
  eq: (..._args: unknown[]) => ({}),
  memberActivities: {
    memberId: 'memberActivities.memberId',
    occurredAt: 'memberActivities.occurredAt',
  },
}));

describe('getMemberActivitiesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns [] without querying when member_activities table is absent', async () => {
    mocks.execute.mockResolvedValue([{ regclass: null }]);

    const { getMemberActivitiesCore } = await import('./get-member');

    const result = await getMemberActivitiesCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      memberId: 'member-1',
    });

    expect(result).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('queries and returns activities when member_activities table exists', async () => {
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.findMany.mockResolvedValue([{ id: 'a1' }]);

    const { getMemberActivitiesCore } = await import('./get-member');

    const result = await getMemberActivitiesCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      memberId: 'member-1',
    });

    expect(mocks.findMany).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'a1' }]);
  });
});
