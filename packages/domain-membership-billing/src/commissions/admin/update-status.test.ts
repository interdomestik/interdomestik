import { db } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preflightCommissionPayability } from './payability';
import { updateCommissionStatusCore } from './update-status';

// Mock dependencies
vi.mock('@interdomestik/database', () => {
  const db = {
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
  };
  return {
    db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(db)),
  };
});

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

vi.mock('./payability', () => ({
  preflightCommissionPayability: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: [
        {
          id: 'c1',
          status: 'pending',
        },
      ],
    })
  ),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

describe('updateCommissionStatusCore', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preflightCommissionPayability).mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'c1',
          status: 'pending',
          memberId: 'member-1',
          subscriptionStatus: 'active',
          subscriptionAgentId: 'agent-1',
          userAgentId: 'agent-1',
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
        },
      ],
    });
  });

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  };

  // The commission row the status update reads, owned by `agentId`.
  function loadCommission(agentId: string, status: string): void {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 'c1', agentId, status }]),
        }),
      }),
    });
  }

  function updateAsAdmin(newStatus: 'approved' | 'pending') {
    return updateCommissionStatusCore({
      session: mockAdminSession as any,
      authority,
      commissionId: 'c1',
      newStatus,
    });
  }

  it('prevents self-approval if admin is also the agent', async () => {
    loadCommission('admin-1', 'pending');

    const result = await updateAsAdmin('approved');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot approve or pay your own commission');
  });

  it('prevents invalid status transitions', async () => {
    loadCommission('agent-1', 'paid');

    // Try to move from 'paid' back to 'pending' (invalid)
    const result = await updateAsAdmin('pending');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('allows valid transition by admin', async () => {
    loadCommission('agent-1', 'pending');

    const result = await updateAsAdmin('approved');

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it('blocks payable transitions when enterprise controls return a violation', async () => {
    vi.mocked(preflightCommissionPayability).mockResolvedValueOnce({
      ok: false,
      violation: {
        control: 'finance',
        code: 'FINANCE_PAYABILITY_BLOCKED',
        detail: 'Commission is not payable under enterprise controls: c1',
        recoverable: false,
        entityIds: ['c1'],
      },
    });

    loadCommission('agent-1', 'pending');

    const result = await updateAsAdmin('approved');

    expect(result.success).toBe(false);
    expect(result.violation?.entityIds).toEqual(['c1']);
    expect(db.update).not.toHaveBeenCalled();
  });
});
