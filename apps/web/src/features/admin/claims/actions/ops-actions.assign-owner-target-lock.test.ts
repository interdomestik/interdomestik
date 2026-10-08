import { user } from '@interdomestik/database/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSIGNMENT_TARGET_DENIED_ERROR,
  assignmentActionMocks as mocks,
  assignOwner,
} from './ops-assignment.test-bootstrap';
import {
  createFakeTx,
  type FakeTxOptions,
  guardMatchesRow,
  routeTenantContext,
  sessionFor,
} from './ops-assignment.test-fixture';

const ELIGIBLE_TARGET = { id: 'staff-1', tenantId: 'tenant-1', role: 'staff' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.directDbAccess.length = 0;
  mocks.getSession.mockResolvedValue(sessionFor('admin'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function assignThroughFakeTx(options: FakeTxOptions = {}) {
  const fake = createFakeTx(options);
  const outcomes = routeTenantContext(mocks.withTenantContext, fake.tx);
  return { ...fake, outcomes, result: assignOwner('claim-1', 'staff-1', 'en') };
}

describe('assignOwner target eligibility lock', () => {
  it('locks the target row FOR SHARE by exact tenant, id and staff role', async () => {
    const { targetLock, result } = assignThroughFakeTx();
    await expect(result).resolves.toMatchObject({ success: true });

    expect(targetLock).toHaveBeenCalledTimes(1);
    const [lock] = targetLock.mock.calls[0];
    expect(lock.strength).toBe('share');
    expect(lock.table).toBe(user);
    expect(Object.keys(lock.fields)).toEqual(['id']);
    expect(lock.fields.id).toBe(user.id);
    expect(guardMatchesRow(lock.where, ELIGIBLE_TARGET, user)).toBe(true);
  });

  it.each([
    ['a concurrent role change to member', { role: 'member' }],
    ['a concurrent move to a foreign tenant', { tenantId: 'tenant-foreign' }],
    ['a different user id', { id: 'staff-2' }],
  ] as const)('locked predicate excludes the row after %s', async (_label, change) => {
    const { targetLock, result } = assignThroughFakeTx();
    await result;
    const [lock] = targetLock.mock.calls[0];
    expect(guardMatchesRow(lock.where, { ...ELIGIBLE_TARGET, ...change }, user)).toBe(false);
  });

  it('acquires the lock after the claim read and before the update and audit', async () => {
    const { tx, targetLock, result } = assignThroughFakeTx();
    await expect(result).resolves.toMatchObject({ success: true });

    const [claimRead] = tx.query.claims.findFirst.mock.invocationCallOrder;
    const [lock] = targetLock.mock.invocationCallOrder;
    const [update] = tx.update.mock.invocationCallOrder;
    const [audit] = tx.insert.mock.invocationCallOrder;
    expect(claimRead).toBeLessThan(lock);
    expect(lock).toBeLessThan(update);
    expect(update).toBeLessThan(audit);
  });

  it('denies without writes, audit or revalidation when no eligible row remains', async () => {
    const { tx, targetLock, outcomes, result } = assignThroughFakeTx({ target: undefined });
    await expect(result).resolves.toEqual({
      success: false,
      error: ASSIGNMENT_TARGET_DENIED_ERROR,
    });
    expect(targetLock).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['returned']);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('fails closed before any write when acquiring the target lock fails', async () => {
    const { tx, outcomes, result } = assignThroughFakeTx({
      targetLockError: new Error('deadlock detected'),
    });
    await expect(result).resolves.toEqual({
      success: false,
      error: 'Assignment failed. Please try again.',
    });
    expect(outcomes).toEqual(['threw']);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
