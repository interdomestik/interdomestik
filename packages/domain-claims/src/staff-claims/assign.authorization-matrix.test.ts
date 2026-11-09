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

// Shapes produced by the support mocks, so each assertion names the predicate a query consumed.
const eq = (left: string, right: unknown) => ({ left, right, op: 'eq' });
const and = (...conditions: unknown[]) => ({ op: 'and', conditions });
const or = (...conditions: unknown[]) => ({ op: 'or', conditions });
const isNull = (column: string) => ({ column, op: 'isNull' });
// A member's draft is never staff work: both scopes carry the lifecycle exclusion.
const submitted = { op: 'lifecycleNotIn', statuses: ['draft'] };
const scoped = (column: string, condition: unknown) => ({
  tenantId: 'tenant-1',
  column,
  condition,
});

function expectConsumedScope(claimScope: unknown, assignee: unknown, guard: unknown) {
  const claimWhere = scoped('claims.tenant_id', claimScope);
  expect(mocks.selectChain.where).toHaveBeenCalledWith(claimWhere);
  expect(mocks.userFindFirst).toHaveBeenCalledWith({
    where: scoped('user.tenant_id', assignee),
    columns: { id: true },
  });
  expect(mocks.updateSetChain.where).toHaveBeenCalledWith(and(claimWhere, guard));
}

function claimInScope(staffId: string | null) {
  mocks.selectChain.limit.mockResolvedValue([{ id: 'claim-1', staffId, branchId: 'branch-1' }]);
}

function assign(session: ReturnType<typeof createSession>, staffId?: string | null) {
  return assignClaimCore({ authority, claimId: 'claim-1', session, staffId });
}

function expectNoEffects() {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.userFindFirst).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.auditValues).not.toHaveBeenCalled();
}

describe('staff assignClaimCore nine-role authorization matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.auditValues });
    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.update.mockReturnValue(mocks.updateChain);
    mocks.updateChain.set.mockReturnValue(mocks.updateSetChain);
    mocks.updateSetChain.where.mockReturnValue(mocks.updateWhereChain);
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);
    mocks.userFindFirst.mockResolvedValue({ id: 'staff-2' });
    mocks.withTenant.mockImplementation((tenantId, column, condition) => ({
      tenantId,
      column,
      condition,
    }));
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
    expectConsumedScope(
      and(eq('claims.id', 'claim-1'), submitted, eq('claims.branch_id', 'branch-1')),
      and(
        and(eq('user.id', 'staff-2'), eq('user.role', 'staff')),
        eq('user.branch_id', 'branch-1')
      ),
      isNull('claims.staff_id')
    );
    expect(mocks.auditValues).toHaveBeenCalledTimes(1);
  });

  it('keeps branchless staff on their own or unassigned claims', async () => {
    claimInScope('staff-1');
    const session = createSession({ userId: 'staff-1', branchId: null });

    await expect(assign(session, 'staff-2')).resolves.toEqual({ success: true });
    expectConsumedScope(
      and(
        eq('claims.id', 'claim-1'),
        submitted,
        or(eq('claims.staff_id', 'staff-1'), isNull('claims.staff_id'))
      ),
      and(eq('user.id', 'staff-2'), eq('user.role', 'staff')),
      eq('claims.staff_id', 'staff-1')
    );
  });

  it('lets in-scope staff unassign without a target lookup', async () => {
    claimInScope('staff-1');

    await expect(
      assign(createSession({ userId: 'staff-1', branchId: 'branch-1' }), null)
    ).resolves.toEqual({ success: true });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.auditValues).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'claim.unassigned',
        metadata: { previousStaffId: 'staff-1', newStaffId: null },
      })
    );
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
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });
});
