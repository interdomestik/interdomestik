import { claimId, configureTransaction, mocks, signIn } from './ops-status-action.test-support';
import { updateClaimStatus as updateStaffStatus } from '@/actions/staff-claims.core';
import { auditLog, claims } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { updateStatus } from './ops-actions';

describe('claim status access and preconditions', () => {
  it.each(['member', 'staff'])(
    'denies an admin status call from %s before claim I/O',
    async role => {
      signIn(role);
      await expect(updateStatus(claimId, 'verification', 'en')).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.kick).not.toHaveBeenCalled();
    }
  );

  it.each(['member', 'agent', 'branch_manager', 'admin', 'auditor'])(
    'denies a staff status call from %s before claim I/O',
    async role => {
      signIn(role);
      await expect(updateStaffStatus(claimId, 'verification')).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.rateLimit).not.toHaveBeenCalled();
    }
  );

  it('refuses a staff authority without a principal before claim I/O', async () => {
    signIn('staff', { principal: false });
    await expect(updateStaffStatus(claimId, 'verification')).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns the same staff denial when the scoped claim lock returns no row', async () => {
    signIn('staff');
    const tx = configureTransaction({ inScope: false });
    await expect(updateStaffStatus(claimId, 'verification')).resolves.toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
    expect(tx.firstLock).toHaveBeenCalledWith(claims, 'no key update');
    expect(tx.writes).toEqual([]);
    expect(tx.committed()).toBe(false);
  });

  it('uses the trusted access tenant when an admin session has a different home', async () => {
    const authority = signIn('admin', { tenant: 'tenant-access' });
    const tx = configureTransaction();
    await expect(updateStatus(claimId, 'verification', 'en')).resolves.toEqual({ success: true });
    expect(mocks.transaction.mock.calls[0][0]).toBe(authority);
    expect(tx.inserts.find(effect => effect.table === auditLog)?.row.tenantId).toBe(
      'tenant-access'
    );
  });

  it.each([
    ['draft', 'submitted', 'draft_not_changeable'],
    ['submitted', 'rejected', 'decline_reason_required'],
  ] as const)('refuses admin %s to %s with %s', async (current, target, code) => {
    signIn('admin');
    const tx = configureTransaction({ current });
    await expect(updateStatus(claimId, target, 'en')).resolves.toMatchObject({
      success: false,
      code,
    });
    expect(tx.writes).toEqual([]);
    expect(tx.inserts).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
