import { describe, expect, it } from 'vitest';

import {
  canReviewLeadDuplicates,
  isReferralInScope,
  resolveDuplicateReviewScope,
} from './review-scope';

const ctx = (userRole: string, branchId: string | null = null) => ({
  userRole,
  scope: { branchId },
});

describe('duplicate review scope (IDA-CRM-003)', () => {
  it.each(['tenant_admin', 'admin', 'super_admin'])('gives %s the whole session tenant', role => {
    expect(resolveDuplicateReviewScope(ctx(role, 'branch-a'))).toEqual({ kind: 'tenant' });
    expect(canReviewLeadDuplicates(role)).toBe(true);
  });

  it('limits a branch manager to the own branch and fails closed without one', () => {
    expect(resolveDuplicateReviewScope(ctx('branch_manager', 'branch-a'))).toEqual({
      kind: 'branch',
      branchId: 'branch-a',
    });
    expect(resolveDuplicateReviewScope(ctx('branch_manager'))).toEqual({ kind: 'none' });
    expect(canReviewLeadDuplicates('branch_manager')).toBe(true);
  });

  it.each(['staff', 'agent', 'member', 'user', 'auditor', 'global_support', '', 'unknown'])(
    'refuses %s with FORBIDDEN before any transaction',
    role => {
      expect(() => resolveDuplicateReviewScope(ctx(role, 'branch-a'))).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' })
      );
      expect(canReviewLeadDuplicates(role)).toBe(false);
    }
  );

  it('shows a branch manager only referrals whose submitting and lead branches are both own', () => {
    const branch = { kind: 'branch', branchId: 'branch-a' } as const;
    const row = (submittingBranchId: string | null, leadBranchId: string | null) => ({
      submittingBranchId,
      leadBranchId,
    });

    expect(isReferralInScope(branch, row('branch-a', 'branch-a'))).toBe(true);
    expect(isReferralInScope(branch, row('branch-a', 'branch-b'))).toBe(false);
    expect(isReferralInScope(branch, row('branch-b', 'branch-a'))).toBe(false);
    // A referral whose lead is gone (or moved out) is for tenant reviewers only.
    expect(isReferralInScope(branch, row('branch-a', null))).toBe(false);
    expect(isReferralInScope({ kind: 'none' }, row('branch-a', 'branch-a'))).toBe(false);
    expect(isReferralInScope({ kind: 'tenant' }, row(null, null))).toBe(true);
  });
});
