import { mocks } from './queue.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getStaffSupportHandoffDetail } from './queue';

function mockSelectRows(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    where: vi.fn().mockReturnThis(),
  };
  mocks.db.select.mockReturnValue(query);
  return query;
}

const authority = mintTestTenantAuthority('tenant-1');

describe('getStaffSupportHandoffDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns scoped detail fields with normalized lifecycle timestamps and actor names', async () => {
    const query = mockSelectRows([
      {
        acceptedAt: new Date('2026-05-04T08:30:00.000Z'),
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        memberId: 'member-1',
        memberReply: 'This resolves my request.',
        memberReplyAt: new Date('2026-05-04T11:10:00.000Z'),
        memberReplyResponseVersion: 2,
        publicResponse: 'We are checking this.',
        publicResponseAt: new Date('2026-05-04T11:00:00.000Z'),
        publicResponseAcknowledgedAt: new Date('2026-05-04T11:05:00.000Z'),
        publicResponseAcknowledgedById: 'member-1',
        publicResponseAcknowledgedVersion: 2,
        publicResponseVersion: 2,
        reassignedAt: '2026-05-04T10:00:00.000Z',
        reassignedByName: 'Staff Two',
        reassignReason: 'Specialist needed',
        source: 'member_help',
      },
    ]);

    const detail = await getStaffSupportHandoffDetail({
      branchId: 'branch-1',
      handoffId: 'handoff-1',
      staffId: 'staff-1',
      authority,
      viewerRole: 'staff',
    });

    expect(mocks.db.select).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedAt: 'support_handoffs.accepted_at',
        acceptedByName: expect.any(String),
        closedAt: 'support_handoffs.closed_at',
        closedByName: expect.any(String),
        contactPreference: 'support_handoffs.contact_preference',
        publicResponse: 'support_handoffs.public_response',
        publicResponseAt: 'support_handoffs.public_response_at',
        publicResponseAcknowledgedAt: 'support_handoffs.public_response_acknowledged_at',
        publicResponseAcknowledgedById: 'support_handoffs.public_response_acknowledged_by_id',
        publicResponseAcknowledgedVersion: 'support_handoffs.public_response_acknowledged_version',
        publicResponseVersion: 'support_handoffs.public_response_version',
        memberReply: 'support_handoffs.member_reply',
        memberReplyAt: 'support_handoffs.member_reply_at',
        memberReplyResponseVersion: 'support_handoffs.member_reply_response_version',
        source: 'support_handoffs.source',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.id', 'handoff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(detail).toEqual({
      acceptedAt: '2026-05-04T08:30:00.000Z',
      acceptedByName: 'Staff One',
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'phone',
      memberReply: {
        memberReply: 'This resolves my request.',
        memberReplyAt: '2026-05-04T11:10:00.000Z',
        memberReplyResponseVersion: 2,
      },
      publicResponse: {
        publicResponse: 'We are checking this.',
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        publicResponseAcknowledged: true,
        publicResponseAcknowledgedAt: '2026-05-04T11:05:00.000Z',
        publicResponseAcknowledgedVersion: 2,
        publicResponseVersion: 2,
      },
      reassignedAt: '2026-05-04T10:00:00.000Z',
      reassignedByName: 'Staff Two',
      reassignReason: 'Specialist needed',
      source: 'member_help',
    });
  });

  it('lets branch managers fetch branch-scoped detail without staff fallback filtering', async () => {
    mockSelectRows([]);

    await getStaffSupportHandoffDetail({
      branchId: 'branch-1',
      handoffId: 'handoff-1',
      staffId: 'manager-1',
      authority,
      viewerRole: 'branch_manager',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.staff_id', 'manager-1');
  });

  it.each([undefined, null, '', '   '])(
    'denies branchless managers in the detail reader before any query (%s)',
    async branchId => {
      const detail = await getStaffSupportHandoffDetail({
        authority,
        branchId,
        handoffId: 'handoff-1',
        staffId: 'manager-1',
        viewerRole: 'branch_manager',
      });
      expect(detail).toBeNull();
      expect(mocks.db.select).not.toHaveBeenCalled();
    }
  );

  it('retains own-or-unassigned filtering for branchless ordinary staff', async () => {
    mockSelectRows([]);
    await getStaffSupportHandoffDetail({
      authority,
      branchId: null,
      handoffId: 'handoff-1',
      staffId: 'staff-1',
      viewerRole: 'staff',
    });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
  });

  it('returns null when the handoff is not visible in scope', async () => {
    mockSelectRows([]);

    await expect(
      getStaffSupportHandoffDetail({
        branchId: 'branch-1',
        handoffId: 'missing',
        staffId: 'staff-1',
        authority,
        viewerRole: 'staff',
      })
    ).resolves.toBeNull();
  });
});
