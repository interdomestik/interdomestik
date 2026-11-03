import { mocks, createSession, authority } from './assign.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withTenantContext } from '@interdomestik/database';

import { assignClaimCore } from './assign';

describe('staff assignClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.update.mockReturnValue(mocks.updateChain);
    mocks.updateChain.set.mockReturnValue(mocks.updateSetChain);
    mocks.updateSetChain.where.mockReturnValue(mocks.updateWhereChain);
    mocks.userFindFirst.mockResolvedValue({
      email: 'staff-two@example.com',
      id: 'staff-2',
      name: 'Staff Two',
    });
  });

  it('denies cross-tenant assignment with a generic error and no mutation', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', tenantId: 'tenant-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('denies branch mismatch when staff branch is present', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.eq).toHaveBeenCalledWith('claims.branch_id', 'branch-1');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects invalid assignee input fail-closed with no mutation', async () => {
    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      staffId: { bad: true } as never,
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid staff assignment',
      data: undefined,
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows manual reassignment within branch scope when the target staff is eligible', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-2', branchId: 'branch-1' },
    ]);
    mocks.userFindFirst.mockResolvedValueOnce({
      email: 'staff-three@example.com',
      id: 'staff-3',
      name: 'Staff Three',
    });
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        authority,
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        staffId: 'staff-3',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.userFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedById: 'staff-1',
        staffId: 'staff-3',
      })
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('allows first self-assign in scope for branch staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        authority,
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('denies manual assignment when the selected staff member is out of scope', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.userFindFirst.mockResolvedValueOnce(null);

    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      staffId: 'staff-9',
    });

    expect(result).toEqual({
      success: false,
      error: 'Staff member not found or out of scope',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
