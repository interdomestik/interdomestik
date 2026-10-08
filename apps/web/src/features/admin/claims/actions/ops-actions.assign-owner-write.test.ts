import { claims } from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSIGNMENT_CONFLICT_ERROR,
  ASSIGNMENT_TARGET_DENIED_ERROR,
  assignmentActionMocks as mocks,
  assignOwner,
} from './ops-assignment.test-bootstrap';
import {
  createFakeTx,
  guardMatchesRow,
  routeTenantContext,
  sessionFor,
  sqlOf,
  UNASSIGNED_CLAIM,
} from './ops-assignment.test-fixture';

function expectNoWritesOrRevalidation(tx: ReturnType<typeof createFakeTx>['tx']) {
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.insert).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.directDbAccess.length = 0;
  mocks.getSession.mockResolvedValue(sessionFor('admin'));
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('assignOwner tenant transaction', () => {
  it('assigns an unassigned claim to the chosen staff member', async () => {
    const { tx, updateSet, updateWhere, auditValues } = createFakeTx();
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'sq')).resolves.toEqual({
      success: true,
      data: {
        id: 'claim-1',
        staffId: 'staff-1',
        assignedAt: expect.any(Date),
        assignedById: 'actor-1',
      },
    });

    expect(outcomes).toEqual(['returned']);
    expect(updateSet).toHaveBeenCalledWith({
      staffId: 'staff-1',
      assignedAt: expect.any(Date),
      assignedById: 'actor-1',
      updatedAt: expect.any(Date),
    });
    const guard = sqlOf(updateWhere.mock.calls[0][0]);
    expect(guard.sql).toMatch(/is null/i);
    expect(guard.params).toEqual(expect.arrayContaining(['claim-1', 'tenant-1']));
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        action: 'assign_owner',
        entityType: 'claim',
        entityId: 'claim-1',
        metadata: {
          previousStaffId: null,
          newStaffId: 'staff-1',
          claimNumber: UNASSIGNED_CLAIM.claimNumber,
        },
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sq/admin/claims/claim-1', 'page');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sq/admin/claims', 'page');
    expect(mocks.directDbAccess).toEqual([]);
  });

  it('reassigns with compare-and-set on the previously read staff member', async () => {
    const { tx, updateWhere, auditValues, targetLock } = createFakeTx({
      claim: { ...UNASSIGNED_CLAIM, staffId: 'staff-old' },
      target: { id: 'staff-2' },
    });
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-2', 'en')).resolves.toMatchObject({
      success: true,
    });

    const guard = sqlOf(updateWhere.mock.calls[0][0]);
    expect(guard.sql).not.toMatch(/is null/i);
    expect(guard.params).toEqual(expect.arrayContaining(['claim-1', 'tenant-1', 'staff-old']));
    const targetRead = sqlOf(targetLock.mock.calls[0][0].where);
    expect(targetRead.params).toEqual(expect.arrayContaining(['tenant-1', 'staff-2', 'staff']));
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ previousStaffId: 'staff-old', newStaffId: 'staff-2' }),
      })
    );
  });

  it('denies a missing, foreign or non-staff target without writes', async () => {
    const { tx } = createFakeTx({ target: undefined });
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'admin-2', 'en')).resolves.toEqual({
      success: false,
      error: ASSIGNMENT_TARGET_DENIED_ERROR,
    });
    expectNoWritesOrRevalidation(tx);
  });

  it('denies a missing or foreign claim before target lookup or writes', async () => {
    const { tx, targetLock } = createFakeTx({ claim: undefined });
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-x', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(targetLock).not.toHaveBeenCalled();
    expectNoWritesOrRevalidation(tx);
  });

  it('denies a terminal claim before target lookup or writes', async () => {
    const { tx, targetLock } = createFakeTx({
      claim: {
        ...UNASSIGNED_CLAIM,
        caseLifecycleState: 'resolved',
        recoveryLifecycleState: 'resolved',
      },
    });
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Cannot perform assign on a terminal claim.',
    });
    expect(targetLock).not.toHaveBeenCalled();
    expectNoWritesOrRevalidation(tx);
  });

  it('reports a conflict without audit when a concurrent assignment wins', async () => {
    const { tx } = createFakeTx({ updatedRows: [] });
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: ASSIGNMENT_CONFLICT_ERROR,
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('fails the transaction (rollback path) when the audit write fails', async () => {
    const { tx, updateSet } = createFakeTx({ auditError: new Error('audit insert failed') });
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Assignment failed. Please try again.',
    });
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['threw']);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces a failed claim read instead of treating it as empty', async () => {
    const { tx } = createFakeTx({ claimReadError: new Error('claim read failed') });
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Assignment failed. Please try again.',
    });
    expect(outcomes).toEqual(['threw']);
    expectNoWritesOrRevalidation(tx);
  });
  it('compare-and-sets the exact read lifecycle pair alongside the staff guard', async () => {
    const { tx, updateWhere } = createFakeTx();
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toMatchObject({
      success: true,
    });

    const guard = sqlOf(updateWhere.mock.calls[0][0]);
    const caseParam = /"case_lifecycle_state" = \$(\d+)/.exec(guard.sql);
    const recoveryParam = /"recovery_lifecycle_state" = \$(\d+)/.exec(guard.sql);
    expect(caseParam).not.toBeNull();
    expect(recoveryParam).not.toBeNull();
    expect(guard.params[Number(caseParam?.[1]) - 1]).toBe('evaluation');
    expect(guard.params[Number(recoveryParam?.[1]) - 1]).toBe('not_started');
    expect(guard.sql).toMatch(/"staffId" is null/);
  });

  it.each([
    ['resolved', 'resolved'],
    ['rejected', 'closed'],
  ] as const)(
    'conflicts without audit when the claim closes to %s/%s between read and update',
    async (caseLifecycleState, recoveryLifecycleState) => {
      const closedRow = { ...UNASSIGNED_CLAIM, caseLifecycleState, recoveryLifecycleState };
      // The pre-fix staff-only guard would still match the closed, unassigned row.
      const staffOnlyGuard = and(
        eq(claims.id, 'claim-1'),
        eq(claims.tenantId, 'tenant-1'),
        isNull(claims.staffId)
      );
      expect(guardMatchesRow(staffOnlyGuard, closedRow)).toBe(true);

      const { tx, updateSet, updateWhere } = createFakeTx({ rowAtUpdate: closedRow });
      const outcomes = routeTenantContext(mocks.withTenantContext, tx);

      await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
        success: false,
        error: ASSIGNMENT_CONFLICT_ERROR,
      });
      expect(guardMatchesRow(updateWhere.mock.calls[0][0], closedRow)).toBe(false);
      expect(updateSet).toHaveBeenCalledTimes(1);
      expect(outcomes).toEqual(['returned']);
      expect(tx.insert).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it('still assigns when the row is unchanged between read and update', async () => {
    const { tx, auditValues } = createFakeTx({ rowAtUpdate: UNASSIGNED_CLAIM });
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toMatchObject({
      success: true,
    });
    expect(auditValues).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });
});
