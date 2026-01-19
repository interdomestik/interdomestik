import { describe, expect, it, vi } from 'vitest';
import { getStaffDashboardCore } from './_core';

describe('getStaffDashboardCore', () => {
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

  it('returns forbidden for non-staff role', async () => {
    const result = await getStaffDashboardCore({ ...mockParams, role: 'member' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('FORBIDDEN');
    }
  });

  it('assembles stats correctly', async () => {
    // We expect 4 select calls for stats
    const result = await getStaffDashboardCore(mockParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stats.total).toBe(10);
      expect(result.data.recentClaims).toEqual([]);
    }
  });

  it('handles empty database result', async () => {
    mockParams.db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const result = await getStaffDashboardCore(mockParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stats.total).toBe(0);
    }
  });
});
