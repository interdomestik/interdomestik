import { mocks } from './queue.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStaffSupportHandoffQueue } from './queue';

const authority = mintTestTenantAuthority('tenant-1');
const params = { authority, staffId: 'staff-1', limit: 20 };
const sponsor = {
  source: 'sponsor',
  planId: 'family',
  planKey: 'family-key',
  lifecycle: { status: 'active', cancelAtPeriodEnd: true, gracePeriodEndsAt: null },
};
function queueRow(id: string) {
  return {
    handoff: { id: `handoff-${id}`, status: 'open' },
    member: { id, name: id },
    claim: null,
    agentName: 'Agent',
    branchName: 'Branch',
  };
}
function setup(rows: ReturnType<typeof queueRow>[]) {
  const queue = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  const plans = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([
      { id: 'family-key', name: 'Family' },
      { id: 'old-key', name: 'Standard' },
    ]),
  };
  mocks.db.select.mockReturnValueOnce(queue).mockReturnValueOnce(plans);
  return { queue, plans };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.select.mockReset();
  mocks.resolveMembership.mockReset();
});

describe('support queue effective membership', () => {
  it('batches sources 1–3 and shows the effective plan and status for each member', async () => {
    setup([
      queueRow('sponsored'),
      queueRow('ordinary'),
      queueRow('uncovered'),
      queueRow('sponsored'),
    ]);
    mocks.resolveMembership.mockResolvedValue(
      new Map<string, unknown>([
        ['sponsored', sponsor],
        [
          'ordinary',
          {
            source: 'subscription',
            subscription: { provider: 'paddle', status: 'canceled', planKey: 'old-key' },
          },
        ],
        ['uncovered', { source: 'none' }],
      ])
    );
    const result = await getStaffSupportHandoffQueue(params);
    expect(result.map(row => row.relationship)).toEqual([
      { planName: 'Family', membershipStatus: 'active', agentName: 'Agent', branchName: 'Branch' },
      {
        planName: 'Standard',
        membershipStatus: 'canceled',
        agentName: 'Agent',
        branchName: 'Branch',
      },
      { planName: null, membershipStatus: null, agentName: 'Agent', branchName: 'Branch' },
      { planName: 'Family', membershipStatus: 'active', agentName: 'Agent', branchName: 'Branch' },
    ]);
    expect(mocks.resolveMembership).toHaveBeenCalledTimes(1);
    expect(mocks.resolveMembership).toHaveBeenCalledWith(
      mocks.db,
      'tenant-1',
      ['sponsored', 'ordinary', 'uncovered'],
      expect.any(Date)
    );
    expect(mocks.eq).toHaveBeenCalledWith(mocks.membershipPlans.tenantId, 'tenant-1');
    expect(mocks.inArray).toHaveBeenCalledWith(mocks.membershipPlans.id, ['family-key', 'old-key']);
    expect(result[0]?.claim).toBeNull();
  });

  it('does not infer membership from an uncovered group_sponsor cache row', async () => {
    setup([queueRow('member-1')]);
    mocks.resolveMembership.mockResolvedValue(new Map([['member-1', { source: 'none' }]]));
    const result = await getStaffSupportHandoffQueue(params);
    expect(result[0]?.relationship).toMatchObject({ planName: null, membershipStatus: null });
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it('fails closed for an absent resolver member and an empty queue', async () => {
    setup([queueRow('member-1')]);
    mocks.resolveMembership.mockResolvedValue(new Map());
    expect((await getStaffSupportHandoffQueue(params))[0]?.relationship).toMatchObject({
      planName: null,
      membershipStatus: null,
    });
    mocks.db.select.mockReset();
    setup([]);
    await expect(getStaffSupportHandoffQueue(params)).resolves.toEqual([]);
    expect(mocks.resolveMembership).toHaveBeenLastCalledWith(
      mocks.db,
      'tenant-1',
      [],
      expect.any(Date)
    );
  });

  it('does not display a stale membership if the resolver fails', async () => {
    setup([queueRow('member-1')]);
    mocks.resolveMembership.mockRejectedValue(new Error('coverage unavailable'));
    await expect(getStaffSupportHandoffQueue(params)).rejects.toThrow('coverage unavailable');
  });
});
