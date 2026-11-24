import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClaim,
  hoisted,
  mockSelectChains,
  readContexts,
  resetOpsClaimDetailMocks,
  sqlOf,
} from './getOpsClaimDetail.test-fixtures';
import { getOpsClaimDetail } from './getOpsClaimDetail';

describe('getOpsClaimDetail divergent document signing', () => {
  beforeEach(resetOpsClaimDetailMocks);

  it('batches exact home references after access-tenant authorization and signs for the storage home', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'admin-1', accessTenantId: 'tenant_ks', tenantId: 'tenant_home', role: 'admin' },
    });
    hoisted.visibleClaimFrom.mockResolvedValueOnce([
      {
        ...createClaim(),
        agentId: 'agent-1',
        staffId: 'staff-1',
        branchId: 'branch-1',
      },
    ]);
    const branchWhere = vi.fn().mockReturnValue({
      limit: async () => [{ id: 'branch-1', code: 'HOME-A', name: 'Home Branch' }],
    });
    const { docsRows, peopleWhere, noteWhere } = mockSelectChains(branchWhere);
    docsRows.limit.mockResolvedValueOnce([
      {
        id: 'doc-1',
        tenantId: 'tenant_home',
        name: 'proof.pdf',
        filePath: 'pii/tenants/tenant_home/claims/claim-1/proof.pdf',
        bucket: 'claim-evidence',
      },
    ]);
    peopleWhere.mockResolvedValueOnce([
      { id: 'member-1', name: 'Member', email: 'm@example.test', memberNumber: 'MEM-1' },
      { id: 'agent-1', name: 'Agent Home' },
      { id: 'staff-1', name: 'Staff Home', email: 'staff-home@example.test' },
    ]);
    noteWhere.mockReturnValueOnce({
      orderBy: () => ({
        limit: async () => [
          {
            note: 'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.',
          },
        ],
      }),
    });

    const result = await getOpsClaimDetail('claim-1');

    expect(result.kind).toBe('ok');
    expect(hoisted.delegateClaimHomeTenantRead).toHaveBeenCalledWith(
      hoisted.withTenantContext.mock.calls[0][0],
      'claim-1'
    );
    expect(readContexts()).toEqual([
      { tenantId: 'tenant_ks', role: 'admin' },
      { tenantId: 'tenant_home', role: 'admin' },
    ]);
    expect(peopleWhere).toHaveBeenCalledTimes(1);
    expect(sqlOf(peopleWhere.mock.lastCall?.[0]).params).toEqual([
      'tenant_home',
      'member-1',
      'agent-1',
      'staff-1',
    ]);
    expect(hoisted.mapClaimToOperationalRow).toHaveBeenCalledWith(
      expect.objectContaining({
        claimant: expect.objectContaining({ email: 'm@example.test', memberNumber: 'MEM-1' }),
        agent: { name: 'Agent Home' },
        staff: { name: 'Staff Home', email: 'staff-home@example.test' },
        branch: { id: 'branch-1', code: 'HOME-A', name: 'Home Branch' },
        claim: expect.objectContaining({ diasporaCountry: 'IT' }),
      })
    );
    expect(hoisted.signDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'pii/tenants/tenant_home/claims/claim-1/proof.pdf',
        tenantId: 'tenant_home',
      })
    );
  });
});
