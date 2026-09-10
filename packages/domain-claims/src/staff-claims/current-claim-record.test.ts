import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: {
    caseLifecycleState: 'claims.case_lifecycle_state',
    category: 'claims.category',
    recoveryLifecycleState: 'claims.recovery_lifecycle_state',
    staffId: 'claims.staff_id',
    title: 'claims.title',
    userId: 'claims.user_id',
  },
  db: {
    select: vi.fn(() => {
      throw new Error('global db used');
    }),
  },
}));

vi.mock('@interdomestik/database', () => ({
  claims: mocks.claims,
  db: mocks.db,
}));

import { loadStaffCurrentClaimRecord } from './current-claim-record';

function transactionReturning(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return { chain, tx: { select: vi.fn(() => chain) } };
}

describe('loadStaffCurrentClaimRecord', () => {
  it('uses the supplied tenant transaction', async () => {
    const row = {
      caseLifecycleState: 'verification',
      category: 'vehicle',
      recoveryLifecycleState: 'not_started',
      staffId: 'staff-1',
      title: 'Vehicle claim',
      userId: 'member-1',
    };
    const { chain, tx } = transactionReturning([row]);
    const scope = { query: 'scope' };

    await expect(loadStaffCurrentClaimRecord(tx as never, scope as never)).resolves.toEqual({
      status: 'found',
      currentClaim: { ...row, status: 'verification' },
    });
    expect(tx.select).toHaveBeenCalledOnce();
    expect(chain.where).toHaveBeenCalledWith(scope);
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it('keeps not-found and invalid lifecycle results fail closed', async () => {
    const missing = transactionReturning([]);
    await expect(loadStaffCurrentClaimRecord(missing.tx as never, {} as never)).resolves.toEqual({
      status: 'not_found',
    });

    const invalid = transactionReturning([
      {
        caseLifecycleState: null,
        category: 'vehicle',
        recoveryLifecycleState: null,
        staffId: null,
        title: 'Vehicle claim',
        userId: 'member-1',
      },
    ]);
    await expect(loadStaffCurrentClaimRecord(invalid.tx as never, {} as never)).resolves.toEqual({
      status: 'invalid_current_status',
    });
  });
});
