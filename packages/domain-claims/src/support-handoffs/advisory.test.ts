import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  claims: {
    claimNumber: 'claims.claim_number',
    id: 'claims.id',
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
    title: 'claims.title',
  },
  count: vi.fn(() => 'count()'),
  db: {
    select: vi.fn(),
  },
  desc: vi.fn(column => ({ column, op: 'desc' })),
  eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
  inArray: vi.fn((left, right) => ({ left, op: 'inArray', right })),
  supportHandoffs: {
    claimId: 'support_handoffs.claim_id',
    createdAt: 'support_handoffs.created_at',
    id: 'support_handoffs.id',
    memberId: 'support_handoffs.member_id',
    source: 'support_handoffs.source',
    status: 'support_handoffs.status',
    tenantId: 'support_handoffs.tenant_id',
    updatedAt: 'support_handoffs.updated_at',
  },
  withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
}));

vi.mock('@interdomestik/database', () => ({
  claims: mocks.claims,
  db: mocks.db,
  desc: mocks.desc,
  eq: mocks.eq,
  supportHandoffs: mocks.supportHandoffs,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  count: mocks.count,
  inArray: mocks.inArray,
}));

import { getMemberActiveHandoffAdvisory } from './advisory';
import { ACTIVE_HANDOFF_STATUSES } from './types';

function queueCountRows(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  mocks.db.select.mockReturnValueOnce(query);
  return query;
}

function queueClaimMatchRows(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
  mocks.db.select.mockReturnValueOnce(query);
  return query;
}

function expectForbiddenFieldsAbsent(value: unknown) {
  const forbidden = [
    'staffId',
    'staffName',
    'message',
    'closeReason',
    'reassignReason',
    'acceptedByName',
    'closedByName',
    'reassignedByName',
  ];

  for (const key of forbidden) {
    expect(value).not.toHaveProperty(key);
    if (value && typeof value === 'object') {
      for (const nestedValue of Object.values(value)) {
        if (nestedValue && typeof nestedValue === 'object') {
          expect(nestedValue).not.toHaveProperty(key);
        }
      }
    }
  }
}

describe('getMemberActiveHandoffAdvisory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty advisory for a member with zero active handoffs', async () => {
    const countQuery = queueCountRows([{ activeCount: 0 }]);

    await expect(
      getMemberActiveHandoffAdvisory({ memberId: 'member-1', tenantId: 'tenant-1' })
    ).resolves.toEqual({ activeCount: 0, claimMatch: null, linkedClaim: null });

    expect(mocks.db.select).toHaveBeenCalledTimes(1);
    expect(countQuery.where).toHaveBeenCalledWith(expect.objectContaining({ scoped: true }));
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.member_id', 'member-1');
    expect(mocks.inArray).toHaveBeenCalledWith('support_handoffs.status', ACTIVE_HANDOFF_STATUSES);
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'support_handoffs.tenant_id',
      expect.any(Object)
    );
  });

  it('returns one same-claim active handoff summary with linked claim metadata', async () => {
    queueCountRows([{ activeCount: 2 }]);
    const matchQuery = queueClaimMatchRows([
      {
        claimNumber: 'CLM-1',
        claimStatus: 'submitted',
        claimTitle: 'Washer claim',
        createdAt: new Date('2026-05-04T08:30:00.000Z'),
        source: 'member_claim_detail',
        status: 'accepted',
        updatedAt: '2026-05-04T10:15:00.000Z',
      },
    ]);

    await expect(
      getMemberActiveHandoffAdvisory({
        claimId: 'claim-1',
        memberId: 'member-1',
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual({
      activeCount: 2,
      claimMatch: {
        createdAt: '2026-05-04T08:30:00.000Z',
        sourceLabel: 'member_claim_detail',
        status: 'accepted',
        updatedAt: '2026-05-04T10:15:00.000Z',
      },
      linkedClaim: {
        label: 'CLM-1',
        status: 'submitted',
      },
    });

    expect(matchQuery.limit).toHaveBeenCalledWith(1);
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.claim_id', 'claim-1');
  });

  it('returns a generic advisory when active handoffs exist but none match the requested claim', async () => {
    const countQuery = queueCountRows([{ activeCount: 3 }]);
    queueClaimMatchRows([]);

    await expect(
      getMemberActiveHandoffAdvisory({
        claimId: 'claim-2',
        memberId: 'member-1',
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual({ activeCount: 3, claimMatch: null, linkedClaim: null });

    expect(JSON.stringify(countQuery.where.mock.calls[0]?.[0])).not.toContain('claim-2');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.claim_id', 'claim-2');
  });

  it('excludes closed handoffs from the active count', async () => {
    queueCountRows([{ activeCount: 0 }]);

    await expect(
      getMemberActiveHandoffAdvisory({ memberId: 'member-closed', tenantId: 'tenant-1' })
    ).resolves.toEqual({ activeCount: 0, claimMatch: null, linkedClaim: null });

    expect(mocks.inArray).toHaveBeenCalledWith('support_handoffs.status', ACTIVE_HANDOFF_STATUSES);
  });

  it("does not expose another tenant's active handoffs", async () => {
    queueCountRows([{ activeCount: 0 }]);

    await expect(
      getMemberActiveHandoffAdvisory({ memberId: 'member-1', tenantId: 'tenant-2' })
    ).resolves.toEqual({ activeCount: 0, claimMatch: null, linkedClaim: null });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-2',
      'support_handoffs.tenant_id',
      expect.any(Object)
    );
  });

  it('excludes staff-only fields from the advisory response', async () => {
    queueCountRows([{ activeCount: 1 }]);
    queueClaimMatchRows([
      {
        claimNumber: null,
        claimStatus: null,
        claimTitle: 'Fallback claim title',
        createdAt: '2026-05-04T08:30:00.000Z',
        source: 'member_help',
        status: 'open',
        updatedAt: '2026-05-04T08:30:00.000Z',
      },
    ]);

    const result = await getMemberActiveHandoffAdvisory({
      claimId: 'claim-1',
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });

    expectForbiddenFieldsAbsent(result);
    expect(result).toEqual({
      activeCount: 1,
      claimMatch: {
        createdAt: '2026-05-04T08:30:00.000Z',
        sourceLabel: 'member_help',
        status: 'open',
        updatedAt: '2026-05-04T08:30:00.000Z',
      },
      linkedClaim: {
        label: 'Fallback claim title',
        status: null,
      },
    });
  });
});
