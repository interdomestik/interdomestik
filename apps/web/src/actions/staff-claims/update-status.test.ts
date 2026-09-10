import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as nextCache from 'next/cache';

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  claims: {
    caseLifecycleState: { name: 'caseLifecycleState' },
    id: { name: 'id' },
    recoveryLifecycleState: { name: 'recoveryLifecycleState' },
    tenantId: { name: 'tenantId' },
    status: { name: 'status' },
  },
  claimStageHistory: { tenantId: { name: 'tenantId' } },
  db: {},
  withTenantContext: (...args: unknown[]) => mocks.withTenantContext(...args),
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { updateClaimStatusCore } from './update-status';

describe('updateClaimStatusCore', () => {
  const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(async (_context, run) =>
      run({
        select: () => ({
          from: () => ({ where: () => ({ limit: () => mocks.dbSelect() }) }),
        }),
      })
    );
  });

  it('no-ops when status unchanged and no note', async () => {
    mocks.dbSelect.mockResolvedValue([
      { caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started' },
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'submitted' as unknown as import('./types').ClaimStatus,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
        session: { id: 's1' },
      } as unknown as NonNullable<import('./context').Session>,
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    for (const locale of LOCALES)
      for (const path of [
        '/staff/claims/claim-1',
        '/staff/claims',
        '/member/claims/claim-1',
        '/member/claims',
      ])
        expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}${path}`);
    expect(nextCache.revalidatePath).toHaveBeenCalledTimes(LOCALES.length * 4);
  });
});
