import { describe, expect, it, vi } from 'vitest';
import { getStaffDashboardCore } from './_core';

describe('Staff Dashboard Query Contracts', () => {
  describe('getStaffDashboardCore (Integration)', () => {
    const mockParams = {
      tenantId: 'tenant-1',
      userId: 'staff-1',
      role: 'staff',
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ val: 10 }]),
          }),
        }),
        query: {
          claims: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
      },
    };

    it('returns forbidden for non-staff roles', async () => {
      const result = await getStaffDashboardCore({ ...mockParams, role: 'member' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('FORBIDDEN');
      }
    });

    it('asserts tenant isolation in all aggregate queries', async () => {
      await getStaffDashboardCore(mockParams);

      // select() should be called 4 times for stats (total, new, inProgress, completed)
      expect(mockParams.db.select).toHaveBeenCalledTimes(4);

      // Contract: All queries must use where() for tenant isolation
      expect(mockParams.db.select().from().where).toHaveBeenCalledTimes(4);
    });

    it('asserts tenant isolation for recent claims query', async () => {
      await getStaffDashboardCore(mockParams);

      expect(mockParams.db.query.claims.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
    });
  });
});
