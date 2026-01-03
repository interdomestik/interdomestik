import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  claims: { id: { name: 'id' }, tenantId: { name: 'tenantId' }, status: { name: 'status' } },
  claimStageHistory: { tenantId: { name: 'tenantId' } },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mocks.dbSelect(),
        }),
      }),
    }),
    transaction: mocks.dbTransaction,
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

  it('no-ops when status unchanged and no note', async () => {
    mocks.dbSelect.mockResolvedValue([{ status: 'submitted' }]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'submitted' as unknown as import('./types').ClaimStatus,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
        session: { id: 's1' },
      } as unknown as NonNullable<import('./context').Session>,
    });

    expect(result).toEqual({ success: true });
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });
});
