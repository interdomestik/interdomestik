import { describe, expect, it } from 'vitest';

import { canAccessClaimFromAdminUploadSurface } from './access';

describe('canAccessClaimFromAdminUploadSurface', () => {
  it('allows assigned staff even when the claim branch differs', () => {
    expect(
      canAccessClaimFromAdminUploadSurface({
        branchId: 'branch-2',
        claim: { branchId: 'branch-1', staffId: 'staff-2' },
        role: 'staff',
        userId: 'staff-2',
      })
    ).toBe(true);
  });
});
