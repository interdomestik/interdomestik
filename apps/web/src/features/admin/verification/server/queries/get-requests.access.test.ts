import { beforeEach, describe, expect, it } from 'vitest';

import { createRecordingTx, ctx, hoisted } from './verification-access.test-fixtures';
import { getVerificationRequests } from './get-requests';

describe('getVerificationRequests access', () => {
  beforeEach(() => {
    hoisted.withTenantContext.mockReset();
    hoisted.globalDbReads.length = 0;
  });

  it.each(['member', 'agent', 'global_support', 'auditor', 'unknown'])(
    'rejects %s with FORBIDDEN before any transaction',
    async role => {
      await expect(getVerificationRequests(ctx(role), { view: 'queue' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it.each(['branch_manager', 'staff'])(
    'returns the empty list for branchless %s before any transaction',
    async role => {
      await expect(getVerificationRequests(ctx(role), { view: 'queue' })).resolves.toEqual([]);
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('reads the admin queue tenant-wide through the callback transaction', async () => {
    const rows = [{ id: 'attempt-1', memberEmailVerified: null }];
    const { executed } = createRecordingTx([rows]);

    const context = ctx('admin', 'branch-1');
    const result = await getVerificationRequests(context, { view: 'queue' });

    // Without the member join the pending flag is false, never the raw column.
    expect(result).toEqual([{ id: 'attempt-1', memberActivationPending: false }]);
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toBe(context.authority);
    expect(executed).toHaveLength(1);
    const query = executed[0]!;
    expect(query.params).toEqual(
      expect.arrayContaining(['tenant-ks', 'cash', 'pending', 'needs_info'])
    );
    expect(query.params).not.toContain('branch-1');
    expect(query.params.at(-1)).toBe(100);
    expect(query.sql).toMatch(/"deleted_at" is null/);
    expect(query.sql).toMatch(/"is_resubmission" desc, .*"created_at" asc/);
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it.each(['staff', 'branch_manager'])(
    'limits %s history to the own branch with the verifier join',
    async role => {
      const { executed } = createRecordingTx([[]]);

      const context = ctx(role, 'branch-1');
      await getVerificationRequests(context, { view: 'history', query: ' ana ' });

      expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toBe(context.authority);
      const query = executed[0]!;
      expect(query.params).toEqual(
        expect.arrayContaining(['tenant-ks', 'branch-1', 'succeeded', 'rejected', '%ana%'])
      );
      expect(query.params.at(-1)).toBe(50);
      expect(query.sql).toContain('"verifier"');
      // ACQ-2b2: only branch managers see resendable activations; staff never join the member.
      expect(query.sql.includes('"member"')).toBe(role === 'branch_manager');
      expect(query.sql).toMatch(/"updated_at" desc/);
    }
  );

  it('propagates read failures from the transaction', async () => {
    const failure = new Error('permission denied for table lead_payment_attempts');
    createRecordingTx([failure]);

    await expect(getVerificationRequests(ctx('admin'), { view: 'queue' })).rejects.toBe(failure);
  });
});
