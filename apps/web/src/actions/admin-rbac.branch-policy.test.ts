import { describe, expect, it } from 'vitest';
import {
  mockCreateGuardedBranchCore,
  mockUpdateGuardedBranchCore,
} from './admin-rbac.wrapper.test-support';
import { createBranch, updateBranch } from './admin-rbac.core';

describe('branch policy action contract', () => {
  it('preserves the policy discriminant for both create and reactivation', async () => {
    const failure = {
      error: 'Only one active branch is allowed for this tenant.',
      code: 'single_branch_limit',
    };
    mockCreateGuardedBranchCore.mockResolvedValue(failure);
    mockUpdateGuardedBranchCore.mockResolvedValue(failure);
    expect(await createBranch({ name: 'Second' })).toEqual({ success: false, ...failure });
    expect(
      await updateBranch({ branchId: 'branch-2', data: { name: 'Second', isActive: true } })
    ).toEqual({ success: false, ...failure });
  });
});
