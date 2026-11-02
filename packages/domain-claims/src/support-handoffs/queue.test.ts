import { mocks } from './queue.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildStaffSupportHandoffQueueScope } from './queue';

type QueueScopeArgs = Parameters<typeof buildStaffSupportHandoffQueueScope>[0];

function buildScope(overrides: Partial<QueueScopeArgs> = {}) {
  const base: QueueScopeArgs = {
    assignment: 'all',
    branchId: 'branch-1',
    staffId: 'staff-1',
    status: 'open',
    tenantId: 'tenant-1',
    viewerRole: 'staff',
  };
  return buildStaffSupportHandoffQueueScope({ ...base, ...overrides });
}

describe('buildStaffSupportHandoffQueueScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes staff all-queue reads to the staff branch and own-or-unassigned handoffs', () => {
    const scope = buildScope({ assignment: 'all' });

    expect(scope).toEqual({ condition: expect.any(Object), scoped: true });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'open');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'support_handoffs.tenant_id',
      expect.any(Object)
    );
  });

  it('lets branch managers see the whole branch without staff fallback filtering', () => {
    buildScope({
      assignment: 'all',
      staffId: 'manager-1',
      viewerRole: 'branch_manager',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.staff_id', 'manager-1');
    expect(mocks.isNull).not.toHaveBeenCalledWith('support_handoffs.staff_id');
  });

  it('falls back to own-or-unassigned filtering for branch managers without branch scope', () => {
    buildScope({
      branchId: null,
      staffId: 'manager-1',
      viewerRole: 'branch_manager',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'manager-1');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
  });

  it('supports mine, unassigned, claim-link, urgency, and search filters', () => {
    buildScope({
      assignment: 'mine',
      claimLink: 'linked',
      search: '  member   query  ',
      urgency: 'critical',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.urgency', 'critical');
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.claim_id');
    expect(mocks.ilike).toHaveBeenCalledWith('support_handoffs.subject', '%member query%');

    vi.clearAllMocks();
    buildScope({ assignment: 'unassigned', claimLink: 'unlinked' });

    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.claim_id');
  });

  it('supports filtering to handoffs with current-cycle member replies', () => {
    buildScope({ attention: 'needs_follow_up' });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.gt).toHaveBeenCalledWith('support_handoffs.public_response_version', 0);
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.member_reply_at');
    expect(mocks.eq).toHaveBeenCalledWith(
      'support_handoffs.member_reply_response_version',
      'support_handoffs.public_response_version'
    );
  });

  it('lets the needs-follow-up attention filter override contradictory status input', () => {
    buildScope({ attention: 'needs_follow_up', status: 'closed' });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.status', 'closed');
  });
});
