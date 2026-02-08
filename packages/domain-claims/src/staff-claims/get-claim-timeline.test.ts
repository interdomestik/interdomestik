import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  return {
    selectChain,
    db: { select: vi.fn() },
    claimStageHistory: {
      id: 'claim_stage_history.id',
      tenantId: 'claim_stage_history.tenant_id',
      claimId: 'claim_stage_history.claim_id',
      fromStatus: 'claim_stage_history.from_status',
      toStatus: 'claim_stage_history.to_status',
      createdAt: 'claim_stage_history.created_at',
    },
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    desc: vi.fn(column => ({ column, op: 'desc' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  claimStageHistory: mocks.claimStageHistory,
  eq: mocks.eq,
  and: mocks.and,
  desc: mocks.desc,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

import { getClaimTimeline } from './get-claim-timeline';

describe('getClaimTimeline', () => {
  beforeEach(() => {
    mocks.db.select.mockReset();
    mocks.db.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockReset();
  });

  it('returns empty array when claim is outside tenant scope', async () => {
    mocks.selectChain.orderBy.mockResolvedValue([]);

    const result = await getClaimTimeline({ tenantId: 'tenant-ks', claimId: 'claim-1' });

    expect(result).toEqual([]);
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claimStageHistory.tenantId,
      expect.any(Object)
    );
  });

  it('enforces deterministic ordering with createdAt desc and id desc tie-breaker', async () => {
    mocks.selectChain.orderBy.mockResolvedValue([]);

    await getClaimTimeline({ tenantId: 'tenant-ks', claimId: 'claim-1' });

    expect(mocks.selectChain.orderBy).toHaveBeenCalledWith(
      { column: mocks.claimStageHistory.createdAt, op: 'desc' },
      { column: mocks.claimStageHistory.id, op: 'desc' }
    );
  });
});
