import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => mocks.logAuditEvent(...args),
}));

vi.mock('@/lib/notifications', () => ({
  notifyStatusChanged: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@interdomestik/database', () => ({
  claims: {
    id: 'id',
    tenantId: 'tenantId',
    status: 'status',
    userId: 'userId',
    title: 'title',
    staffId: 'staffId',
  },
  user: { id: 'id', tenantId: 'tenantId', email: 'email' },
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => mocks.dbSelect(),
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: mocks.dbUpdate }),
    }),
  },
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { updateClaimStatusCore } from './update-status';

describe('updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies staff updating claims not assigned to them', async () => {
    mocks.dbSelect.mockResolvedValue([
      {
        id: 'claim-1',
        title: 'Test Claim',
        status: 'submitted',
        staffId: 'staff-2',
        userId: 'user-1',
        userEmail: 'user@test.com',
      },
    ]);

    await expect(
      updateClaimStatusCore({
        claimId: 'claim-1',
        newStatus: 'resolved',
        session: {
          user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
          session: { id: 'session-1' },
        } as unknown as import('./context').Session,
        requestHeaders: new Headers(),
      })
    ).rejects.toThrow('Access denied');

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
