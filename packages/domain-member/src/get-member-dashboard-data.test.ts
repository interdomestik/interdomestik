import { beforeAll, describe, expect, it, vi } from 'vitest';
const mockDb = vi.hoisted(() => ({
  query: {
    user: { findFirst: vi.fn() },
    claims: { findMany: vi.fn() },
  },
}));

vi.mock('@interdomestik/database', () => ({ db: mockDb }));
vi.mock('@interdomestik/database/schema', () => ({
  claims: { tenantId: 'claim.tenant_id', userId: 'claim.userId', updatedAt: 'updatedAt' },
  user: { tenantId: 'user.tenant_id', id: 'user.id' },
}));
const mockWithTenant = vi.hoisted(() => vi.fn());

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mockWithTenant,
}));

function dateISO(value: string) {
  return new Date(value);
}

let getMemberDashboardData: typeof import('./get-member-dashboard-data').getMemberDashboardData;

describe('getMemberDashboardData', () => {
  beforeAll(async () => {
    const module = await import('./get-member-dashboard-data');
    getMemberDashboardData = module.getMemberDashboardData;
  });

  mockWithTenant.mockImplementation(
    (_tenantId: string, _col: string, condition: unknown) => condition
  );

  it('selects most recently updated open claim as activeClaimId', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({
      id: 'member-1',
      name: 'Member One',
      memberNumber: 'M-0001',
      tenantId: 'tenant-1',
    });

    mockDb.query.claims.findMany.mockResolvedValue([
      {
        id: 'c-1',
        claimNumber: 'CLM-001',
        status: 'resolved',
        createdAt: dateISO('2026-01-01'),
        updatedAt: dateISO('2026-01-05'),
      },
      {
        id: 'c-2',
        claimNumber: 'CLM-002',
        status: 'submitted',
        createdAt: dateISO('2026-01-02'),
        updatedAt: dateISO('2026-02-01'),
      },
      {
        id: 'c-3',
        claimNumber: 'CLM-003',
        status: 'verification',
        createdAt: dateISO('2026-01-03'),
        updatedAt: dateISO('2026-01-20'),
      },
    ]);

    const data = await getMemberDashboardData({
      memberId: 'member-1',
      tenantId: 'tenant-1',
      locale: 'sq',
    });

    expect(data.member.name).toBe('Member One');
    expect(data.activeClaimId).toBe('c-2');
    expect(data.claims[0].claimNumber).toBe('CLM-002');
    expect(data.claims[0].stageKey).toBe('submitted');
    expect(data.claims[0].stageLabel).toBe('Submitted');
    expect(data.claims[0].requiresMemberAction).toBe(false);
    expect(data.claims[0].nextMemberAction).toBeUndefined();
    expect(data.supportHref).toBe('/sq/member/help');
  });

  it('returns empty-state friendly data when there are no claims', async () => {
    mockDb.query.user.findFirst.mockResolvedValue({
      id: 'member-2',
      name: 'Member Two',
      memberNumber: null,
      tenantId: 'tenant-1',
    });

    mockDb.query.claims.findMany.mockResolvedValue([]);

    const data = await getMemberDashboardData({
      memberId: 'member-2',
      tenantId: 'tenant-1',
      locale: 'sq',
    });

    expect(data.claims).toHaveLength(0);
    expect(data.activeClaimId).toBeNull();
  });
});
