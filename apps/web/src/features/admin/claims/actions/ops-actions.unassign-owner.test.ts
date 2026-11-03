import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSIGNMENT_CONFLICT_ERROR,
  assignmentActionMocks as mocks,
  unassignOwner,
} from './ops-assignment.test-bootstrap';
import {
  createFakeTx,
  guardMatchesRow,
  routeTenantContext,
  sessionFor,
  UNASSIGNED_CLAIM,
} from './ops-assignment.test-fixture';

const ASSIGNED_CLAIM = { ...UNASSIGNED_CLAIM, staffId: 'staff-1' };
const RESOLVED = { caseLifecycleState: 'resolved', recoveryLifecycleState: 'resolved' };
const GENERIC_ERROR = 'Assignment failed. Please try again.';
const SENTINEL = 'sentinel-identity-7c1d';

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

describe('unassignOwner single transaction', () => {
  it('reads, clears and audits in one tenant transaction', async () => {
    const { tx, updateSet, auditValues } = createFakeTx({ claim: ASSIGNED_CLAIM });
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    const result = await unassignOwner('claim-1', 'en');

    expect(result).toMatchObject({
      success: true,
      data: { id: 'claim-1', staffId: null, assignedAt: null },
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['returned']);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: null, assignedAt: null, assignedById: null })
    );
    expect(auditValues).toHaveBeenCalledTimes(1);
    expect(auditValues.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      action: 'unassign_owner',
      entityId: 'claim-1',
      metadata: { previousStaffId: 'staff-1', claimNumber: UNASSIGNED_CLAIM.claimNumber },
    });
    expect(mocks.revalidatePath).toHaveBeenCalled();
    expect(mocks.directDbAccess).toEqual([]);
  });

  it('guards the clear on the read owner and both lifecycle states', async () => {
    const { tx, updateWhere } = createFakeTx({ claim: ASSIGNED_CLAIM });
    routeTenantContext(mocks.withTenantContext, tx);

    await unassignOwner('claim-1', 'en');

    const guard = updateWhere.mock.calls[0][0];
    expect(guardMatchesRow(guard, ASSIGNED_CLAIM)).toBe(true);
    expect(guardMatchesRow(guard, { ...ASSIGNED_CLAIM, staffId: 'staff-2' })).toBe(false);
    expect(guardMatchesRow(guard, { ...ASSIGNED_CLAIM, staffId: null })).toBe(false);
    expect(guardMatchesRow(guard, { ...ASSIGNED_CLAIM, caseLifecycleState: 'resolved' })).toBe(
      false
    );
    expect(guardMatchesRow(guard, { ...ASSIGNED_CLAIM, recoveryLifecycleState: 'resolved' })).toBe(
      false
    );
    expect(guardMatchesRow(guard, { ...ASSIGNED_CLAIM, tenantId: 'tenant-2' })).toBe(false);
  });

  it('conflicts without auditing or revalidating when another writer reassigned first', async () => {
    const { tx, auditValues } = createFakeTx({
      claim: ASSIGNED_CLAIM,
      rowAtUpdate: { ...ASSIGNED_CLAIM, staffId: 'staff-2' },
    });
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    const result = await unassignOwner('claim-1', 'en');

    expect(result).toEqual({ success: false, error: ASSIGNMENT_CONFLICT_ERROR });
    expect(outcomes).toEqual(['returned']);
    expect(auditValues).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('treats an already unowned claim as a no-op without a write or audit', async () => {
    const { tx, updateSet, auditValues } = createFakeTx({ claim: UNASSIGNED_CLAIM });
    routeTenantContext(mocks.withTenantContext, tx);

    const result = await unassignOwner('claim-1', 'en');

    expect(result).toEqual({
      success: true,
      data: { id: 'claim-1', staffId: null, assignedAt: null },
    });
    expect(updateSet).not.toHaveBeenCalled();
    expect(auditValues).not.toHaveBeenCalled();
  });

  it('rolls the clear back when the audit fails and returns only the generic error', async () => {
    const auditError = new Error(`Failed query: insert into "audit_log"\nparams: ${SENTINEL}`);
    const { tx, updateSet } = createFakeTx({ claim: ASSIGNED_CLAIM, auditError });
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    const result = await unassignOwner('claim-1', 'en');

    expect(result).toEqual({ success: false, error: GENERIC_ERROR });
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['threw']);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Action Failed: unassignOwner', 'Error');
    expect(JSON.stringify([result, consoleError.mock.calls])).not.toContain(SENTINEL);
  });

  it('returns the exact terminal and missing-claim denials', async () => {
    const terminal = createFakeTx({ claim: { ...ASSIGNED_CLAIM, ...RESOLVED } });
    routeTenantContext(mocks.withTenantContext, terminal.tx);
    await expect(unassignOwner('claim-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Cannot perform assign on a terminal claim.',
    });
    expect(terminal.updateSet).not.toHaveBeenCalled();

    const missing = createFakeTx({ claim: undefined });
    routeTenantContext(mocks.withTenantContext, missing.tx);
    await expect(unassignOwner('claim-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(missing.updateSet).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
