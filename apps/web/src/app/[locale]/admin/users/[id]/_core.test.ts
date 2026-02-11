import { describe, expect, it } from 'vitest';

import {
  computeAdminUserClaimCounts,
  getAdminUserMembershipStatus,
  getAdminUserProfileCore,
} from './_core';

describe('admin user profile core', () => {
  it('computeAdminUserClaimCounts aggregates by status buckets', () => {
    const counts = computeAdminUserClaimCounts([
      { status: 'resolved', total: 2 },
      { status: 'rejected', total: 1 },
      { status: 'submitted', total: 3 },
      { status: null, total: 4 },
    ]);

    expect(counts).toEqual({ total: 10, open: 7, resolved: 2, rejected: 1 });
  });

  it('getAdminUserMembershipStatus normalizes unknown to none', () => {
    expect(getAdminUserMembershipStatus('active')).toBe('active');
    expect(getAdminUserMembershipStatus('past_due')).toBe('past_due');
    expect(getAdminUserMembershipStatus('paused')).toBe('paused');
    expect(getAdminUserMembershipStatus('canceled')).toBe('canceled');
    expect(getAdminUserMembershipStatus('something_else')).toBe('none');
    expect(getAdminUserMembershipStatus(null)).toBe('none');
    expect(getAdminUserMembershipStatus(undefined)).toBe('none');
  });

  it('returns not_found when tenant context is missing', async () => {
    const result = await getAdminUserProfileCore({
      userId: 'any-user',
      tenantId: null,
      recentClaimsLimit: 5,
    });

    expect(result).toEqual({ kind: 'not_found' });
  });
});
