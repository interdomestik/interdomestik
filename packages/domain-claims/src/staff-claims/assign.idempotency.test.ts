import { mocks, createSession, authority } from './assign.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('returns idempotent success without mutation when already assigned to same staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-1', branchId: 'branch-1' },
    ]);

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
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns idempotent success when claim is already assigned to the selected staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-9', branchId: 'branch-1' },
    ]);

    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      staffId: 'staff-9',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('denies branchless staff when claim is not in scope', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: null }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', 'staff-1');
    expect(mocks.isNull).toHaveBeenCalledWith('claims.staff_id');
    expect(mocks.or).toHaveBeenCalled();
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows branchless staff to assign a tenant staff member manually', async () => {
    mocks.selectChain.limit.mockResolvedValue([{ id: 'claim-1', staffId: null, branchId: null }]);
    mocks.userFindFirst.mockResolvedValueOnce({
      email: 'staff-nine@example.com',
      id: 'staff-9',
      name: 'Staff Nine',
    });
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        authority,
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: null }),
        staffId: 'staff-9',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('returns generic denial when manual assignment update loses race', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.userFindFirst.mockResolvedValueOnce({
      email: 'staff-nine@example.com',
      id: 'staff-9',
      name: 'Staff Nine',
    });
    mocks.updateWhereChain.returning.mockResolvedValue([]);

    const result = await assignClaimCore(
      {
        authority,
        claimId: 'claim-1',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        staffId: 'staff-9',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
