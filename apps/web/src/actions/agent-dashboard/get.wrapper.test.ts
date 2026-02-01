import * as roles from '@/lib/roles';
import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentDashboardDataCore } from './get.core';

vi.mock('@interdomestik/database', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    query: {
      claims: {
        findMany: vi.fn(),
      },
    },
    then: vi.fn(),
  };
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);

  return {
    db: mockDb,
    claims: {
      status: { name: 'status' },
      updatedAt: { name: 'updatedAt' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eq: (col: any, val: any) => ({ col, val }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    and: (...args: any[]) => ({ args }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inArray: (col: any, vals: any[]) => ({ col, vals }),
    count: () => ({ type: 'count' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sql: (strings: any) => strings[0],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    desc: (col: any) => ({ col, order: 'desc' }),
  };
});

vi.mock('@interdomestik/database/constants', () => ({
  CLAIM_STATUSES: ['submitted', 'pending', 'resolved', 'rejected'],
}));

vi.mock('@/lib/roles', () => ({
  isStaffOrAdmin: vi.fn(),
}));

describe('getAgentDashboardDataCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw Error if no session', async () => {
    await expect(getAgentDashboardDataCore({ session: null })).rejects.toThrow('Unauthorized');
  });

  it('should return empty stats for agent role', async () => {
    const mockSession = {
      session: {
        id: 's1',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'agent1',
        expiresAt: new Date(Date.now() + 3600000),
        token: 't1',
      },
      user: { id: 'agent1', role: 'agent' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getAgentDashboardDataCore({ session: mockSession as any });
    expect(result.recentClaims).toEqual([]);
    expect(result.stats.total).toBe(0);
  });

  it('should throw if not staff/admin and not agent', async () => {
    const mockSession = {
      session: {
        id: 's2',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user1',
        expiresAt: new Date(Date.now() + 3600000),
        token: 't2',
      },
      user: { id: 'user1', role: 'user' },
    };
    vi.mocked(roles.isStaffOrAdmin).mockReturnValue(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(getAgentDashboardDataCore({ session: mockSession as any })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('should return stats for staff', async () => {
    const mockSession = {
      session: {
        id: 's3',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'staff1',
        expiresAt: new Date(Date.now() + 3600000),
        token: 't3',
      },
      user: { id: 'staff1', role: 'staff' },
    };
    vi.mocked(roles.isStaffOrAdmin).mockReturnValue(true);

    // Mock 4 select calls (total, new, inProgress, completed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).then
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce((cb: any) => cb([{ count: 10 }])) // total
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce((cb: any) => cb([{ count: 2 }])) // new
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce((cb: any) => cb([{ count: 3 }])) // inProgress
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce((cb: any) => cb([{ count: 5 }])); // completed

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.query.claims.findMany).mockResolvedValue([{ id: 'c1' } as any]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getAgentDashboardDataCore({ session: mockSession as any });

    expect(result.stats.total).toBe(10);
    expect(result.stats.new).toBe(2);
    expect(result.recentClaims).toHaveLength(1);
  });
});
