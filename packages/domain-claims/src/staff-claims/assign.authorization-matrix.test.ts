import { mocks, createSession, authority } from './assign.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignClaimCore } from './assign';

/**
 * Nine-role matrix for the mounted staff assignment path. Only staff assign here; administrators
 * use the ops owner actions and every other role holds no assignment capability on this path.
 */
const DENIED_ROLES = [
  'super_admin',
  'admin',
  'tenant_admin',
  'global_support',
  'auditor',
  'branch_manager',
  'agent',
  'member',
  'user',
  '',
] as const;

function claimInScope(staffId: string | null) {
  mocks.selectChain.limit.mockResolvedValue([{ id: 'claim-1', staffId, branchId: 'branch-1' }]);
}

function assign(session: ReturnType<typeof createSession>, staffId?: string | null) {
  return assignClaimCore(
    { authority, claimId: 'claim-1', session, staffId },
    { logAuditEvent: mocks.logAuditEvent }
  );
}

function expectNoEffects() {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.userFindFirst).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.logAuditEvent).not.toHaveBeenCalled();
}

describe('staff assignClaimCore nine-role authorization matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.update.mockReturnValue(mocks.updateChain);
    mocks.updateChain.set.mockReturnValue(mocks.updateSetChain);
    mocks.updateSetChain.where.mockReturnValue(mocks.updateWhereChain);
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);
    mocks.userFindFirst.mockResolvedValue({ id: 'staff-2' });
  });

  it.each(DENIED_ROLES)('gives %s no assignment or unassignment capability', async role => {
    const session = createSession({ userId: 'actor-1', role, branchId: 'branch-1' });

    await expect(assign(session, 'staff-2')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
    await expect(assign(session, null)).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expectNoEffects();
  });

  it('confines branch staff to claims and assignees of their own branch', async () => {
    claimInScope(null);
    const session = createSession({ userId: 'staff-1', branchId: 'branch-1' });

    await expect(assign(session, 'staff-2')).resolves.toEqual({ success: true });
    expect(mocks.eq).toHaveBeenCalledWith('claims.branch_id', 'branch-1');
    expect(mocks.eq).toHaveBeenCalledWith('user.role', 'staff');
    expect(mocks.eq).toHaveBeenCalledWith('user.branch_id', 'branch-1');
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps branchless staff on their own or unassigned claims', async () => {
    claimInScope('staff-1');
    const session = createSession({ userId: 'staff-1', branchId: null });

    await expect(assign(session, 'staff-2')).resolves.toEqual({ success: true });
    expect(mocks.isNull).toHaveBeenCalledWith('claims.staff_id');
    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', 'staff-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
    expect(mocks.eq).toHaveBeenCalledWith('user.role', 'staff');
  });

  it('lets in-scope staff unassign without a target lookup', async () => {
    claimInScope('staff-1');

    await expect(
      assign(createSession({ userId: 'staff-1', branchId: 'branch-1' }), null)
    ).resolves.toEqual({ success: true });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: null, assignedAt: null })
    );
  });

  it('denies staff a claim outside their scope without writing', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    await expect(
      assign(createSession({ userId: 'staff-1', branchId: 'branch-1' }), 'staff-2')
    ).resolves.toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
