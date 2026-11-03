import { mocks } from './queue.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getStaffSupportHandoffQueue } from './queue';

function mockQueueRows(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
  mocks.db.select.mockReturnValue(query);
  return query;
}

const authority = mintTestTenantAuthority('tenant-1');

describe('getStaffSupportHandoffQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('projects current-cycle member replies as staff follow-up attention', async () => {
    const query = mockQueueRows([
      {
        agentName: 'Agent One',
        branchName: 'Prishtina',
        claimId: 'claim-1',
        claimNumber: 'CLM-1',
        claimStatus: 'submitted',
        claimTitle: 'Claim one',
        createdAt: new Date('2026-05-04T10:00:00.000Z'),
        id: 'handoff-1',
        lifecycleVersion: 4,
        memberEmail: 'member@example.com',
        memberId: 'member-1',
        memberName: 'Member One',
        memberNumber: 'MEM-1',
        memberReplyAt: new Date('2026-05-04T11:10:00.000Z'),
        memberReplyResponseVersion: 2,
        membershipStatus: 'active',
        message: 'The member needs support.',
        planName: 'Family',
        publicResponseAt: new Date('2026-05-04T11:00:00.000Z'),
        publicResponseVersion: 2,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
        subject: 'Help with claim',
        trustRisk: 'medium',
        updatedAt: new Date('2026-05-04T11:10:00.000Z'),
        urgency: 'high',
      },
      {
        agentName: 'Agent One',
        branchName: 'Prishtina',
        claimId: 'claim-2',
        claimNumber: 'CLM-2',
        claimStatus: 'submitted',
        claimTitle: 'Claim two',
        createdAt: new Date('2026-05-04T10:00:00.000Z'),
        id: 'handoff-2',
        lifecycleVersion: 5,
        memberEmail: 'member@example.com',
        memberId: 'member-1',
        memberName: 'Member One',
        memberNumber: 'MEM-1',
        memberReplyAt: new Date('2026-05-04T11:10:00.000Z'),
        memberReplyResponseVersion: 2,
        membershipStatus: 'active',
        message: 'The closed handoff is terminal.',
        planName: 'Family',
        publicResponseAt: new Date('2026-05-04T11:00:00.000Z'),
        publicResponseVersion: 2,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'closed',
        subject: 'Closed help',
        trustRisk: 'medium',
        updatedAt: new Date('2026-05-04T11:10:00.000Z'),
        urgency: 'high',
      },
    ]);

    await expect(
      getStaffSupportHandoffQueue({
        attention: 'needs_follow_up',
        branchId: 'branch-1',
        limit: 30,
        staffId: 'staff-1',
        authority,
        viewerRole: 'staff',
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'handoff-1',
        needsFollowUp: true,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'handoff-2',
        needsFollowUp: false,
      }),
    ]);
    expect(mocks.db.select).toHaveBeenCalledWith(
      expect.objectContaining({
        memberReplyAt: 'support_handoffs.member_reply_at',
        memberReplyResponseVersion: 'support_handoffs.member_reply_response_version',
        publicResponseVersion: 'support_handoffs.public_response_version',
      })
    );
    expect(query.limit).toHaveBeenCalledWith(30);
  });
});
