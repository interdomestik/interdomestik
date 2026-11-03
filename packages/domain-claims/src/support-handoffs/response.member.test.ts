import { mocks } from './response.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_HANDOFF_STATUSES } from './types';
import { getMemberLatestPublicResponse } from './response';

const authority = mintTestTenantAuthority('tenant-1');

describe('support handoff public response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([
      {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
    ]);
    mocks.db.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
    mocks.selectOrderBy.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLimit.mockResolvedValue([]);
  });

  it('returns a same-claim member-safe public response when available', async () => {
    mocks.selectLimit.mockResolvedValueOnce([
      {
        publicResponse: 'Claim-specific staff update',
        publicResponseAt: new Date('2026-05-04T09:00:00.000Z'),
        handoffId: 'handoff-1',
        publicResponseAcknowledgedAt: null,
        publicResponseAcknowledgedById: null,
        publicResponseAcknowledgedVersion: null,
        publicResponseVersion: 2,
        memberReply: null,
        memberReplyAt: null,
        memberReplyResponseVersion: null,
      },
    ]);

    const result = await getMemberLatestPublicResponse({
      claimId: 'claim-1',
      memberId: 'member-1',
      authority,
    });

    expect(result).toEqual({
      publicResponse: 'Claim-specific staff update',
      publicResponseAt: '2026-05-04T09:00:00.000Z',
      handoffId: 'handoff-1',
      publicResponseAcknowledged: false,
      publicResponseAcknowledgedAt: null,
      publicResponseAcknowledgedVersion: null,
      publicResponseVersion: 2,
      memberReply: null,
      memberReplyAt: null,
      memberReplyResponseVersion: null,
    });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.member_id', 'member-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.claim_id', 'claim-1');
    expect(mocks.inArray).toHaveBeenCalledWith('support_handoffs.status', ACTIVE_HANDOFF_STATUSES);
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.public_response');
    expect(Object.keys(result ?? {})).toEqual([
      'handoffId',
      'publicResponse',
      'publicResponseAt',
      'publicResponseVersion',
      'publicResponseAcknowledged',
      'publicResponseAcknowledgedAt',
      'publicResponseAcknowledgedVersion',
      'memberReply',
      'memberReplyAt',
      'memberReplyResponseVersion',
    ]);
  });

  it('returns the targeted active handoff response without falling back to another handoff', async () => {
    mocks.selectLimit.mockResolvedValueOnce([
      {
        publicResponse: 'Targeted staff update',
        publicResponseAt: new Date('2026-05-04T11:00:00.000Z'),
        handoffId: 'handoff-1',
        publicResponseAcknowledgedAt: new Date('2026-05-04T11:05:00.000Z'),
        publicResponseAcknowledgedById: 'member-1',
        publicResponseAcknowledgedVersion: 3,
        publicResponseVersion: 3,
        memberReply: 'Thanks, that resolves it.',
        memberReplyAt: new Date('2026-05-04T11:07:00.000Z'),
        memberReplyResponseVersion: 3,
      },
    ]);

    const result = await getMemberLatestPublicResponse({
      claimId: 'claim-1',
      handoffId: 'handoff-1',
      memberId: 'member-1',
      authority,
    });

    expect(result).toEqual({
      publicResponse: 'Targeted staff update',
      publicResponseAt: '2026-05-04T11:00:00.000Z',
      handoffId: 'handoff-1',
      publicResponseAcknowledged: true,
      publicResponseAcknowledgedAt: '2026-05-04T11:05:00.000Z',
      publicResponseAcknowledgedVersion: 3,
      publicResponseVersion: 3,
      memberReply: 'Thanks, that resolves it.',
      memberReplyAt: '2026-05-04T11:07:00.000Z',
      memberReplyResponseVersion: 3,
    });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.id', 'handoff-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.claim_id', 'claim-1');
    expect(mocks.selectLimit).toHaveBeenCalledTimes(1);
  });

  it('falls back to the latest active member response when no same-claim response exists', async () => {
    mocks.selectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        publicResponse: 'Latest generic staff update',
        publicResponseAt: '2026-05-04T10:00:00.000Z',
        handoffId: 'handoff-3',
        publicResponseAcknowledgedAt: new Date('2026-05-04T10:05:00.000Z'),
        publicResponseAcknowledgedById: 'member-1',
        publicResponseAcknowledgedVersion: 2,
        publicResponseVersion: 3,
        memberReply: 'Earlier-cycle reply',
        memberReplyAt: new Date('2026-05-04T10:06:00.000Z'),
        memberReplyResponseVersion: 2,
      },
    ]);

    const result = await getMemberLatestPublicResponse({
      claimId: 'claim-2',
      memberId: 'member-1',
      authority,
    });

    expect(result).toEqual({
      publicResponse: 'Latest generic staff update',
      publicResponseAt: '2026-05-04T10:00:00.000Z',
      handoffId: 'handoff-3',
      publicResponseAcknowledged: false,
      publicResponseAcknowledgedAt: null,
      publicResponseAcknowledgedVersion: 2,
      publicResponseVersion: 3,
      memberReply: 'Earlier-cycle reply',
      memberReplyAt: '2026-05-04T10:06:00.000Z',
      memberReplyResponseVersion: 2,
    });
    expect(mocks.selectLimit).toHaveBeenCalledTimes(2);
  });
});
