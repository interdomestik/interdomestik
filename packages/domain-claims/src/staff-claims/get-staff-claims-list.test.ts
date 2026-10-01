import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStaffClaimsListMocks } from './get-staff-claims-list.test-support';
const { mocks, modules } = await vi.hoisted(async () => {
  const { createStaffClaimsListMocks, createStaffClaimsListModuleMocks } =
    await import('./get-staff-claims-list.test-support');
  const mocks = createStaffClaimsListMocks();
  return { mocks, modules: createStaffClaimsListModuleMocks(mocks) };
});
vi.mock('@interdomestik/database', () => modules.database);
vi.mock('@interdomestik/database/tenant-security', () => modules.tenantSecurity);
vi.mock('drizzle-orm', () => modules.drizzle);

import { getStaffClaimsList } from './get-staff-claims-list';
function expectOwnOrUnassignedQueueScope(args: { staffId: string; tenantId: string }) {
  expect(mocks.withTenant).toHaveBeenCalledWith(
    args.tenantId,
    mocks.claims.tenantId,
    expect.objectContaining({
      op: 'and',
      conditions: expect.arrayContaining([
        expect.objectContaining({ op: 'inArray' }),
        expect.objectContaining({
          op: 'or',
          conditions: expect.arrayContaining([
            expect.objectContaining({ op: 'eq', left: 'claims.staff_id', right: args.staffId }),
            expect.objectContaining({ op: 'isNull', column: 'claims.staff_id' }),
          ]),
        }),
      ]),
    })
  );
}
describe('getStaffClaimsList', () => {
  beforeEach(() => resetStaffClaimsListMocks(mocks));

  it('returns branch claims for branch managers', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        assigneeEmail: 'staff@example.com',
        assigneeName: 'Staff User',
        staffId: null,
        status: 'submitted',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
    ]);

    const result = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expect(mocks.withTenant).toHaveBeenCalledTimes(2);
    expect(mocks.withTenant).toHaveBeenNthCalledWith(
      1,
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'eq', left: 'claims.branch_id', right: 'branch-1' }),
        ]),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].claimNumber).toBe('KS-0001');
    expect(result[0].memberNumber).toBe('M-0001');
    expect(result[0].isDiasporaOrigin).toBe(false);
  });

  it('falls back when branch-manager branch is missing', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expectOwnOrUnassignedQueueScope({ staffId: 'staff-1', tenantId: 'tenant-ks' });
  });

  it('applies the diaspora subquery at the query boundary', async () => {
    mocks.db.select
      .mockReset()
      .mockReturnValueOnce(mocks.diasporaClaimsChain)
      .mockReturnValueOnce(mocks.claimChain);
    mocks.db.selectDistinctOn.mockReset().mockReturnValueOnce(mocks.historyChain);
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        companyName: 'Acme',
        title: 'Diaspora',
        status: 'verification',
        staffId: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
      {
        id: 'claim-2',
        claimNumber: 'KS-0002',
        companyName: 'Acme',
        title: 'Non Diaspora',
        status: 'submitted',
        staffId: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member Two',
        memberNumber: 'M-0002',
      },
    ]);
    mocks.historyChain.orderBy.mockResolvedValue([
      {
        claimId: 'claim-1',
        note: 'Started from Diaspora / Green Card quickstart. Country: DE. Incident location: abroad.',
      },
    ]);

    const result = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
      diasporaOrigin: 'diaspora',
    });

    expect(mocks.inArray).toHaveBeenCalledWith('claims.id', 'diaspora-subquery');
    expect(result[0]?.isDiasporaOrigin).toBe(true);
    expect(result[1]?.isDiasporaOrigin).toBe(false);
    expect(result[1]?.diasporaCountry).toBeNull();
  });

  it('limits default staff queue to own and unassigned claims', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'staff',
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'eq', left: 'claims.branch_id', right: 'branch-1' }),
          expect.objectContaining({
            op: 'or',
            conditions: expect.arrayContaining([
              expect.objectContaining({ op: 'eq', left: 'claims.staff_id', right: 'staff-1' }),
              expect.objectContaining({ op: 'isNull', column: 'claims.staff_id' }),
            ]),
          }),
        ]),
      })
    );
  });

  it('returns empty when no claims match tenant', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    const result = await getStaffClaimsList({
      staffId: 'staff-2',
      tenantId: 'tenant-mk',
      branchId: 'branch-2',
      limit: 10,
    });

    expect(result).toEqual([]);
  });

  it('includes own and unassigned claims when branchId is null', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-3',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 10,
    });

    expectOwnOrUnassignedQueueScope({ staffId: 'staff-3', tenantId: 'tenant-ks' });
  });

  it('applies assignment, status, and search filters', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-3',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 10,
      assignment: 'unassigned',
      search: 'Acme',
      status: 'verification',
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'inArray', values: ['verification'] }),
          expect.objectContaining({ op: 'isNull', column: 'claims.staff_id' }),
          expect.objectContaining({
            op: 'or',
            conditions: expect.arrayContaining([
              expect.objectContaining({ op: 'ilike', column: 'claims.title', value: '%Acme%' }),
              expect.objectContaining({
                op: 'ilike',
                column: 'claims.company_name',
                value: '%Acme%',
              }),
              expect.objectContaining({
                op: 'ilike',
                column: 'claims.claim_number',
                value: '%Acme%',
              }),
              expect.objectContaining({ op: 'ilike', column: 'user.name', value: '%Acme%' }),
              expect.objectContaining({
                op: 'ilike',
                column: 'user.member_number',
                value: '%Acme%',
              }),
            ]),
          }),
        ]),
      })
    );
  });

  it('applies deterministic ordering by updatedAt DESC then id DESC', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-4',
      tenantId: 'tenant-ks',
      branchId: 'branch-4',
      limit: 10,
    });

    expect(mocks.claimChain.orderBy).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'desc', value: 'claims.updated_at' }),
      expect.objectContaining({ op: 'desc', value: 'claims.id' })
    );
  });
});
