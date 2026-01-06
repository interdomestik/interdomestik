import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCommissionStatusCore } from './update-status';

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    id: 'id',
    tenantId: 'tenantId',
    status: 'status',
    agentId: 'agentId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

describe('updateCommissionStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  };

  it('prevents self-approval if admin is also the agent', async () => {
    // Mock commission owned by admin
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 'c1', agentId: 'admin-1', status: 'pending' }]),
        }),
      }),
    });

    const result = await updateCommissionStatusCore({
      session: mockAdminSession as any,
      commissionId: 'c1',
      newStatus: 'approved',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot approve or pay your own commission');
  });

  it('prevents invalid status transitions', async () => {
    // Mock commission
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 'c1', agentId: 'agent-1', status: 'paid' }]),
        }),
      }),
    });

    // Try to move from 'paid' back to 'pending' (invalid)
    const result = await updateCommissionStatusCore({
      session: mockAdminSession as any,
      commissionId: 'c1',
      newStatus: 'pending',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('allows valid transition by admin', async () => {
    // Mock commission
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 'c1', agentId: 'agent-1', status: 'pending' }]),
        }),
      }),
    });

    const result = await updateCommissionStatusCore({
      session: mockAdminSession as any,
      commissionId: 'c1',
      newStatus: 'approved',
    });

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});
