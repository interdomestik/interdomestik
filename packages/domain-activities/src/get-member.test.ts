import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  execute: vi.fn(),
  findAssignment: vi.fn(),
  findMember: vi.fn(),
  findMany: vi.fn(),
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', left: args[0], right: args[1] })),
}));

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => mocks.and(...args),
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
    query: {
      agentClients: {
        findFirst: (...args: unknown[]) => mocks.findAssignment(...args),
      },
      user: {
        findFirst: (...args: unknown[]) => mocks.findMember(...args),
      },
      memberActivities: {
        findMany: (...args: unknown[]) => mocks.findMany(...args),
      },
    },
  },
  // Minimal shape for query builder inputs
  agentClients: {
    id: 'agentClients.id',
    tenantId: 'agentClients.tenantId',
    agentId: 'agentClients.agentId',
    memberId: 'agentClients.memberId',
    status: 'agentClients.status',
  },
  desc: (x: unknown) => x,
  eq: (...args: unknown[]) => mocks.eq(...args),
  memberActivities: {
    memberId: 'memberActivities.memberId',
    tenantId: 'memberActivities.tenantId',
    occurredAt: 'memberActivities.occurredAt',
  },
  user: {
    id: 'user.id',
    tenantId: 'user.tenantId',
  },
}));

describe('getMemberActivitiesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.findMember.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant-1',
      agentId: 'agent-1',
    });
    mocks.findAssignment.mockResolvedValue(null);
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

  it('queries tenant-scoped activities for the assigned agent', async () => {
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.findMany.mockResolvedValue([{ id: 'a1' }]);

    const { getMemberActivitiesCore } = await import('./get-member');

    const result = await getMemberActivitiesCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      memberId: 'member-1',
    });

    expect(mocks.findMany).toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          op: 'and',
          args: expect.arrayContaining([
            expect.objectContaining({
              op: 'eq',
              left: 'memberActivities.memberId',
              right: 'member-1',
            }),
            expect.objectContaining({
              op: 'eq',
              left: 'memberActivities.tenantId',
              right: 'tenant-1',
            }),
          ]),
        }),
      })
    );
    expect(result).toEqual([{ id: 'a1' }]);
  });

  it('denies unassigned agent reads before querying activities', async () => {
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.findMember.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant-1',
      agentId: 'agent-2',
    });

    const { getMemberActivitiesCore } = await import('./get-member');

    await expect(
      getMemberActivitiesCore({
        session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
        memberId: 'member-1',
      })
    ).rejects.toThrow('Permission denied');

    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('allows active agent-client assignments when user.agentId is not mirrored', async () => {
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.findMember.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant-1',
      agentId: 'legacy-agent',
    });
    mocks.findAssignment.mockResolvedValue({
      id: 'assignment-1',
    });
    mocks.findMany.mockResolvedValue([{ id: 'a1' }]);

    const { getMemberActivitiesCore } = await import('./get-member');

    const result = await getMemberActivitiesCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      memberId: 'member-1',
    });

    expect(result).toEqual([{ id: 'a1' }]);
    expect(mocks.findAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          op: 'and',
          args: expect.arrayContaining([
            expect.objectContaining({
              op: 'eq',
              left: 'agentClients.tenantId',
              right: 'tenant-1',
            }),
            expect.objectContaining({
              op: 'eq',
              left: 'agentClients.agentId',
              right: 'agent-1',
            }),
            expect.objectContaining({
              op: 'eq',
              left: 'agentClients.memberId',
              right: 'member-1',
            }),
            expect.objectContaining({
              op: 'eq',
              left: 'agentClients.status',
              right: 'active',
            }),
          ]),
        }),
      })
    );
  });

  it('skips member lookup for self-service member reads', async () => {
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.findMany.mockResolvedValue([{ id: 'a1' }]);

    const { getMemberActivitiesCore } = await import('./get-member');

    const result = await getMemberActivitiesCore({
      session: { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
      memberId: 'member-1',
    });

    expect(result).toEqual([{ id: 'a1' }]);
    expect(mocks.findMember).not.toHaveBeenCalled();
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('denies cross-tenant reads before querying activities', async () => {
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.findMember.mockResolvedValue(null);

    const { getMemberActivitiesCore } = await import('./get-member');

    await expect(
      getMemberActivitiesCore({
        session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
        memberId: 'member-1',
      })
    ).rejects.toThrow('Permission denied');

    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
