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

  it('getAdminUserMembershipStatus normalizes subscription lifecycle buckets', () => {
    const now = new Date('2026-04-21T00:00:00.000Z');

    expect(getAdminUserMembershipStatus({ status: 'active' }, now)).toBe('active');
    expect(
      getAdminUserMembershipStatus(
        { status: 'past_due', gracePeriodEndsAt: new Date('2026-04-22T00:00:00.000Z') },
        now
      )
    ).toBe('active_in_grace');
    expect(
      getAdminUserMembershipStatus(
        { status: 'past_due', gracePeriodEndsAt: new Date('2026-04-20T00:00:00.000Z') },
        now
      )
    ).toBe('grace_expired');
    expect(getAdminUserMembershipStatus({ status: 'active', cancelAtPeriodEnd: true }, now)).toBe(
      'scheduled_cancel'
    );
    expect(getAdminUserMembershipStatus({ status: 'trialing' }, now)).toBe('trialing');
    expect(getAdminUserMembershipStatus({ status: 'paused' }, now)).toBe('canceled');
    expect(getAdminUserMembershipStatus({ status: 'canceled' }, now)).toBe('canceled');
    expect(getAdminUserMembershipStatus({ status: 'something_else' }, now)).toBe('canceled');
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
