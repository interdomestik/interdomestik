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
    eq: (col: any, val: any) => ({ col, val }),
    and: (...args: any[]) => ({ args }),
    inArray: (col: any, vals: any[]) => ({ col, vals }),
    count: () => ({ type: 'count' }),
    sql: (strings: any) => strings[0],
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
    const session = { user: { role: 'agent' } };
    const result = await getAgentDashboardDataCore({ session: session as any });
    expect(result.recentClaims).toEqual([]);
    expect(result.stats.total).toBe(0);
  });

  it('should throw if not staff/admin and not agent', async () => {
    const session = { user: { role: 'user' } };
    (roles.isStaffOrAdmin as any).mockReturnValue(false);
    await expect(getAgentDashboardDataCore({ session: session as any })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('should return stats for staff', async () => {
    const session = { user: { role: 'staff' } };
    (roles.isStaffOrAdmin as any).mockReturnValue(true);

    // Mock 4 select calls (total, new, inProgress, completed)
    (db.then as any)
      .mockImplementationOnce((cb: any) => cb([{ count: 10 }])) // total
      .mockImplementationOnce((cb: any) => cb([{ count: 2 }])) // new
      .mockImplementationOnce((cb: any) => cb([{ count: 3 }])) // inProgress
      .mockImplementationOnce((cb: any) => cb([{ count: 5 }])); // completed

    (db.query.claims.findMany as any).mockResolvedValue([{ id: 'c1', user: {} }]);

    const result = await getAgentDashboardDataCore({ session: session as any });

    expect(result.stats.total).toBe(10);
    expect(result.stats.new).toBe(2);
    expect(result.recentClaims).toHaveLength(1);
  });
});
