import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
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

const resolveStaffClaimReader = vi.hoisted(() => vi.fn());
vi.mock('./reader-policy', () => ({ resolveStaffClaimReader }));
import { getStaffClaimsList as readStaffClaimsList } from './get-staff-claims-list';
import { grantStaffReader, type StaffReaderArgs } from './staff-claim-reader.test-support';

type ListArgs = Parameters<typeof readStaffClaimsList>[0] & StaffReaderArgs;
async function getStaffClaimsList(args: ListArgs) {
  const rows = await readStaffClaimsList(grantStaffReader(resolveStaffClaimReader, args));
  if (!rows) throw new Error('Expected a granted staff claim reader');
  return rows;
}
const authority = mintTestTenantAuthority('tenant-ks');

describe('getStaffClaimsList filters', () => {
  beforeEach(() => resetStaffClaimsListMocks(mocks));

  it('applies assignment, status, and search filters', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-3',
      authority: authority,
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
      authority: authority,
      branchId: 'branch-4',
      limit: 10,
    });

    expect(mocks.claimChain.orderBy).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'desc', value: 'claims.updated_at' }),
      expect.objectContaining({ op: 'desc', value: 'claims.id' })
    );
  });
});
