import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { preflightCommissionPayability } from './payability';
import { bulkApproveCommissionsCore } from './bulk-approve';

vi.mock('@interdomestik/database', () => ({
  db: {
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
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('./payability', () => ({
  preflightCommissionPayability: vi.fn(),
}));

describe('bulkApproveCommissionsCore', () => {
  const adminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1', email: 'admin@example.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preflightCommissionPayability).mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'comm-ok',
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

  it('runs enterprise-control preflight before bulk approving pending commissions', async () => {
    const result = await bulkApproveCommissionsCore({
      session: adminSession,
      ids: ['comm-ok'],
    });

    expect(result).toEqual({ success: true, data: { count: 1 } });
    expect(preflightCommissionPayability).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      ids: ['comm-ok'],
    });
    expect(db.update).toHaveBeenCalled();
  });

  it('allows tenant admins through the admin gate before enterprise-control preflight', async () => {
    const result = await bulkApproveCommissionsCore({
      session: {
        user: {
          id: 'tenant-admin-1',
          role: 'tenant_admin',
          tenantId: 'tenant-1',
          email: 'tenant-admin@example.com',
        },
      },
      ids: ['comm-ok'],
    });

    expect(result.success).toBe(true);
    expect(preflightCommissionPayability).toHaveBeenCalled();
  });

  it('blocks a mixed batch and lists every unresolved commission id', async () => {
    vi.mocked(preflightCommissionPayability).mockResolvedValueOnce({
      ok: false,
      violation: {
        control: 'finance',
        code: 'FINANCE_BATCH_PAYABILITY_BLOCKED',
        detail:
          'One or more commissions are not payable under enterprise controls: comm-bad-a, comm-bad-b',
        recoverable: false,
        entityIds: ['comm-bad-a', 'comm-bad-b'],
      },
    });

    const result = await bulkApproveCommissionsCore({
      session: adminSession,
      ids: ['comm-ok', 'comm-bad-a', 'comm-bad-b'],
    });

    expect(result.success).toBe(false);
    expect(result.violation?.entityIds).toEqual(['comm-bad-a', 'comm-bad-b']);
    expect(result.error).toContain('comm-bad-a, comm-bad-b');
    expect(db.update).not.toHaveBeenCalled();
  });
});
